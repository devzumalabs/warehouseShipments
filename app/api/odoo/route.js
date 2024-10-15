import { NextResponse } from 'next/server';
import { utcToZonedTime, format } from 'date-fns-tz';

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
    });

    const responseText = await response.text();
    if (!responseText) {
      throw new Error('La respuesta de autenticación está vacía.');
    }

    const data = JSON.parse(responseText);
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
  try {
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
    });

    const responseText = await response.text();
    if (!responseText) {
      throw new Error('La respuesta de solicitud de datos está vacía.');
    }

    const data = JSON.parse(responseText);

    if (data.error) {
      if (data.error.data.message.includes('Session expired') && retry) {
        const newSessionId = await authenticate();
        return fetchData(newSessionId, model, method, domain, fields, false);
      }
      throw new Error(data.error.data.message);
    }

    return data.result;
  } catch (error) {
    console.error('Error en fetchData:', error);
    throw error;
  }
};

// Función para obtener los detalles de los traslados (stock.picking)
const fetchPickingDetails = async (sessionId, pickingIds) => {
  if (!pickingIds || pickingIds.length === 0) return [];

  const pickingsData = await fetchData(
    sessionId,
    'stock.picking',
    'search_read',
    [['id', 'in', pickingIds]],
    ['carrier_tracking_ref']
  );

  return pickingsData;
};

// Función para convertir UTC a la hora local de Tijuana de manera manual
const convertUTCtoTijuanaTime = (dateString) => {

  const date = new Date(dateString); // Crear el objeto Date desde la cadena en UTC

  // Verificar si el objeto Date es válido
  if (isNaN(date)) {
    console.error(`Orden: ${orderName}, Fecha inválida: ${dateString}`);
    return 'Fecha inválida';
  }

  // Restar manualmente las 7 horas de diferencia entre UTC y Tijuana
  const tijuanaOffset = -7; // Tijuana es UTC-7
  const tijuanaTime = new Date(date.getTime() + tijuanaOffset * 60 * 60 * 1000); // Ajustamos la hora

  // Opciones para formatear la fecha en un formato legible
  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true // Para formato de 12 horas con AM/PM
  };

  // Usar Intl.DateTimeFormat para dar formato a la fecha ajustada
  const formatter = new Intl.DateTimeFormat('es-MX', options);
  const formattedDate = formatter.format(tijuanaTime);

  return formattedDate;
};

// Función para obtener las órdenes de venta sin número de guía
const fetchSalesOrdersWithoutTracking = async (sessionId, websiteIds) => {
  try {
    const salesDomain = [
      ['website_id', 'in', websiteIds], 
      ['state', 'in', ['sale', 'done']], // Filtra órdenes de venta confirmadas o completadas
    ];

    const salesData = await fetchData(sessionId, 'sale.order', 'search_read', salesDomain, ['id', 'name', 'amount_untaxed', 'amount_total', 'date_order', 'partner_id', 'picking_ids', 'website_id']);

    if (!salesData || salesData.length === 0) {
      console.warn('No se encontraron órdenes de venta.');
      return [];
    }

    const filteredSales = await Promise.all(salesData.map(async (sale) => {
      // Obtener los detalles de stock.picking (donde está el número de rastreo)
      const pickings = await fetchPickingDetails(sessionId, sale.picking_ids);

      // Verificar si hay alguna referencia de rastreo en stock.picking
      const hasTrackingRef = pickings.some(picking => picking.carrier_tracking_ref && picking.carrier_tracking_ref.trim() !== '');

      // Solo regresar las órdenes que NO tienen número de rastreo (carrier_tracking_ref)
      if (!hasTrackingRef && sale.amount_total > 0) {
        // Obtener las líneas de producto de la orden de venta para determinar el tipo de entrega
        const orderLines = await fetchData(
          sessionId,
          'sale.order.line',
          'search_read',
          [['order_id', '=', sale.id]],
          ['name']
        );

        // Verificar si alguna línea de producto tiene el nombre "Envío local"
        const isLocal = orderLines.some(line => line.name && line.name.toLowerCase().includes('envío local'));
        // Clasificación de la entrega
        const deliveryType = isLocal ? 'Envío local' : 'Envío exterior';

        return {
          id: sale.name,
          id_link: sale.id,  // El identificador interno de la base de datos
          partner_name: sale.partner_id[1],
          subtotal: sale.amount_untaxed,
          total: sale.amount_total,
          date_order: convertUTCtoTijuanaTime(sale.date_order),
          website_name: sale.website_id[1], // Nombre del sitio web
          delivery_type: deliveryType // Clasificación de la entrega
        };
      }

      return null;
    }));

    // Retorna solo las órdenes que no tengan número de rastreo y cuyo total sea mayor que 0
    return filteredSales.filter(order => order !== null);
  } catch (error) {
    console.error('Error al procesar las órdenes de venta:', error);
    throw error;
  }
};

// Función para manejar solicitudes GET
export async function GET(request) {
  try {
    const sessionId = await authenticate();

    // Obtener los IDs de los sitios web Pure Form, Limit-x Nutrition y APX Energy
    const websiteData = await fetchData(sessionId, 'website', 'search_read', [
      ['name', 'in', ['Pure Form', 'Limit-x Nutrition', 'APX Energy']]
    ], ['id', 'name']);

    if (!websiteData || websiteData.length === 0) {
      console.warn('No se encontraron sitios web especificados.');
      return NextResponse.json({ error: 'No se encontraron sitios web especificados.' }, { status: 404 });
    }

    const websiteIds = websiteData.map(website => website.id);

    // Obtener las órdenes de venta sin número de guía y con total mayor a 0 para los sitios web especificados
    const salesOrders = await fetchSalesOrdersWithoutTracking(sessionId, websiteIds);

    if (!salesOrders || salesOrders.length === 0) {
      console.warn('No se encontraron órdenes de venta que coincidan con los criterios.');
      return NextResponse.json({ message: 'No se encontraron órdenes de venta que coincidan con los criterios.' }, { status: 200 });
    }

    return NextResponse.json({
      salesOrders,
    });
  } catch (error) {
    console.error('Error al procesar la solicitud GET:', error);
    return NextResponse.json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
  }
}
