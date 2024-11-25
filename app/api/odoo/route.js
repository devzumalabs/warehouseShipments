import { NextResponse } from 'next/server';
import { AbortController } from 'abort-controller';

// Variables de entorno
const odooUrl = process.env.ODOO_URL;
const dbName = process.env.ODOO_DB;
const username = process.env.ODOO_USERNAME;
const password = process.env.ODOO_PASSWORD;

// Verificar que las variables de entorno estén definidas
if (!odooUrl || !dbName || !username || !password) {
  throw new Error('One or more environment variables are not defined');
}

// Función para autenticarse en Odoo
const authenticate = async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 segundos de timeout

    const response = await fetch(`${odooUrl}/web/session/authenticate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        params: {
          db: dbName,
          login: username,
          password: password,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Error en la autenticación: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.data.message);
    }

    const sessionId = response.headers.get('set-cookie')?.match(/session_id=([^;]+)/)?.[1];
    if (!sessionId) {
      throw new Error('No se pudo obtener el session_id de la respuesta.');
    }

    return sessionId;
  } catch (error) {
    console.error('Error en la autenticación:', error);
    throw error;
  }
};

// Función para realizar una solicitud a la API de Odoo
const fetchData = async (sessionId, model, method, domain = [], fields = [], retry = true) => {
  let retries = 3; // Número de intentos de reintento

  while (retries > 0) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // 5 segundos de timeout

      const response = await fetch(`${odooUrl}/web/dataset/call_kw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `session_id=${sessionId}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: model,
            method: method,
            args: [domain],
            kwargs: {
              fields: fields,
            },
          },
          id: Math.floor(Math.random() * 1000),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (response.headers.get('content-type')?.includes('application/json')) {
        const data = await response.json();
        if (data.error) {
          if (data.error.data.message.includes('Session expired') && retry) {
            const newSessionId = await authenticate();
            return fetchData(newSessionId, model, method, domain, fields, false);
          }
          throw new Error(data.error.data.message);
        }
        return data.result;
      } else {
        throw new Error('La respuesta no es JSON, posiblemente sea un error HTML del servidor');
      }
    } catch (error) {
      console.error(`Error en fetchData: ${error.message}`);
      retries -= 1;
      if (retries === 0) {
        throw error; // Si los reintentos fallan, propaga el error
      }
      console.log('Reintentando la solicitud a Odoo...');
    }
  }
};

// Función para obtener los detalles de los traslados (stock.picking)
const fetchPickingDetails = async (sessionId, saleName) => {
  if (!saleName) return [];

  const pickingsData = await fetchData(
    sessionId,
    'stock.picking',
    'search_read',
    [
      ['origin', '=', saleName],
      ['state', 'not in', ['done', 'cancel', 'draft']],
    ],
    ['origin', 'state'] 
  );

  //console.debug('Datos de traslados obtenidos:', pickingsData);

  return pickingsData;
};

// Función para convertir UTC a la hora local de Tijuana de manera manual
const convertUTCtoTijuanaTime = (dateString) => {
  const date = new Date(dateString);
  if (isNaN(date)) {
    return 'Fecha inválida';
  }
  const tijuanaOffset = -7;
  const tijuanaTime = new Date(date.getTime() + tijuanaOffset * 60 * 60 * 1000);

  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  };

  const formatter = new Intl.DateTimeFormat('es-MX', options);
  return formatter.format(tijuanaTime);
};

// Función para obtener la ciudad del contacto
const getPartnerCity = async (sessionId, partnerId) => {
  if (!partnerId) return null;

  const partnerData = await fetchData(
    sessionId,
    'res.partner',
    'search_read',
    [['id', '=', partnerId]],
    ['city']
  );

  return partnerData.length > 0 ? partnerData[0].city : null;
};

// Función para obtener las órdenes de venta con traslados pendientes
const fetchSalesOrdersWithoutTracking = async (sessionId, websiteIds) => {
  try {
    const salesDomain = [
      ['website_id', 'in', websiteIds],
      ['state', 'in', ['sale', 'done']],
    ];

    const salesData = await fetchData(sessionId, 'sale.order', 'search_read', salesDomain, [
      'id',
      'name',
      'amount_untaxed',
      'amount_total',
      'date_order',
      'partner_id',
      'picking_ids',
      'website_id',
    ]);

    if (!salesData || salesData.length === 0) {
      return [];
    }

    const filteredSales = await Promise.all(
      salesData.map(async (sale) => {
        const pickings = await fetchPickingDetails(sessionId, sale.name);
        //console.debug(`Traslados para la orden ${sale.name}:`, pickings);

        const hasPendingState = pickings.length > 0;
        //console.debug(`Estado pendiente para ${sale.name}:`, hasPendingState);

        if (hasPendingState && sale.amount_total > 0) {
          //console.debug(`Incluir orden ${sale.name} con traslados pendientes:`, pickings);
          const orderLines = await fetchData(
            sessionId,
            'sale.order.line',
            'search_read',
            [['order_id', '=', sale.id]],
            ['name']
          );

          const city = await getPartnerCity(sessionId, sale.partner_id[0]);
          const deliveryType = city === 'Tijuana' ? 'Envío local' : 'Envío exterior';

          //console.debug(`Incluyendo orden ${sale.name} en el resultado.`);

          return {
            id: sale.name,
            id_link: sale.id,
            partner_name: sale.partner_id[1],
            subtotal: sale.amount_untaxed,
            total: sale.amount_total,
            date_order: convertUTCtoTijuanaTime(sale.date_order),
            website_name: sale.website_id[1],
            delivery_type: deliveryType,
            city,
          };
        }
        return null;
      })
    );

    return filteredSales.filter((order) => order !== null);
  } catch (error) {
    console.error('Error al procesar las órdenes de venta:', error);
    throw error;
  }
};

// Función para manejar solicitudes GET
export async function GET(request) {
  console.log('GET request received');

  try {
    const sessionId = await authenticate();

    const websiteData = await fetchData(
      sessionId,
      'website',
      'search_read',
      [['name', 'in', ['Pure Form', 'Limit-x Nutrition', 'APX Energy']]],
      ['id', 'name']
    );

    if (!websiteData || websiteData.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron sitios web especificados.' },
        { status: 404 }
      );
    }

    const websiteIds = websiteData.map((website) => website.id);

    const salesOrders = await fetchSalesOrdersWithoutTracking(sessionId, websiteIds);

    if (!salesOrders || salesOrders.length === 0) {
      return NextResponse.json(
        { message: 'No se encontraron órdenes de venta que coincidan con los criterios.' },
        { status: 200 }
      );
    }

    const response = NextResponse.json({
      salesOrders,
    });

    // Desactivar caché en la respuesta
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');

    return response;
  } catch (error) {
    console.error('Error al procesar la solicitud GET:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
