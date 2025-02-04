import { NextResponse } from "next/server";
import { AbortController } from "abort-controller";

// Variables de entorno
const odooUrl = process.env.ODOO_URL;
const dbName = process.env.ODOO_DB;
const username = process.env.ODOO_USERNAME;
const password = process.env.ODOO_PASSWORD;

// Verificar que las variables de entorno estén definidas
if (!odooUrl || !dbName || !username || !password) {
  throw new Error("One or more environment variables are not defined");
}

// Función para autenticarse en Odoo
const authenticate = async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${odooUrl}/web/dataset/call_kw?_=${Date.now()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session_id=${sessionId}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: {
          model,
          method,
          args: [domain],
          kwargs: { fields, ...kwargs },
        },
        id: Math.floor(Math.random() * 1000),
      }),
      signal: controller.signal,
    });    

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.data.message);
    }

    const sessionId = response.headers
      .get("set-cookie")
      ?.match(/session_id=([^;]+)/)?.[1];
    if (!sessionId) {
      throw new Error("Unable to retrieve session_id from response.");
    }

    return sessionId;
  } catch (error) {
    console.error("Authentication error:", error);
    throw error;
  }
};

// Función para realizar solicitudes a la API de Odoo
const fetchData = async (
  sessionId,
  model,
  method,
  domain = [],
  fields = [],
  kwargs = {},
  retries = 3
) => {
  let attempt = 0;
  while (attempt < retries) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${odooUrl}/web/dataset/call_kw`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${sessionId}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "call",
          params: {
            model,
            method,
            args: [domain],
            kwargs: { fields, ...kwargs },
          },
          id: Math.floor(Math.random() * 1000),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 429) {
        console.warn(
          `Too many requests. Retrying in ${2 ** attempt} seconds...`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, 2 ** attempt * 1000)
        );
        attempt++;
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.data.message);
      }

      return data.result;
    } catch (error) {
      console.error(
        `Error fetching data (Attempt ${attempt + 1}/${retries}):`,
        error
      );
      if (attempt === retries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
      attempt++;
    }
  }
};

// Función para convertir UTC a la hora local de Tijuana
const convertUTCtoTijuanaTime = (dateString) => {
  const date = new Date(dateString);
  if (isNaN(date)) return "Invalid date";

  const tijuanaOffset = -7;
  const tijuanaTime = new Date(date.getTime() + tijuanaOffset * 60 * 60 * 1000);

  const options = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  };

  return new Intl.DateTimeFormat("es-MX", options).format(tijuanaTime);
};

// Endpoint principal
export async function GET(request) {
  try {
    const sessionId = await authenticate();
    console.log("✅ Autenticación exitosa, Session ID:", sessionId);

    const websiteData = await fetchData(
      sessionId,
      "website",
      "search_read",
      [["name", "in", ["Pure Form", "Limit-X Nutrition", "APX Energy"]]],
      ["id", "name"]
    );

    if (!websiteData || websiteData.length === 0) {
      return NextResponse.json(
        { error: "No websites found." },
        { status: 404 }
      );
    }

    const websiteIds = websiteData.map((website) => website.id);

    const salesOrders = await fetchData(
      sessionId,
      "sale.order",
      "search_read",
      [
        ["website_id", "in", websiteIds],
        ["state", "in", ["sale", "done"]], // Filtramos por estado de orden de ventas
      ],
      [
        "id",
        "name",
        "amount_untaxed",
        "amount_total",
        "date_order",
        "partner_id",
        "picking_ids",
        "website_id",
      ]
    );

    // Obtener IDs de clientes de todas las órdenes
    const partnerIds = salesOrders.map((order) => order.partner_id[0]);

    // Obtener ciudades en una sola consulta
    const partnersData = await fetchData(
      sessionId,
      "res.partner",
      "search_read",
      [["id", "in", partnerIds]],
      ["id", "city"]
    );

    // Crear un mapa de ID -> ciudad
    const partnersMap = Object.fromEntries(
      partnersData.map((partner) => [partner.id, partner.city])
    );

    // Obtener todos los pickings en una sola consulta
    const pickingData = await fetchData(
      sessionId,
      "stock.picking",
      "search_read",
      [
        ["origin", "in", salesOrders.map((order) => order.name)],
        ["state", "not in", ["done", "cancel", "draft"]],
      ],
      ["origin", "state"]
    );

    // Crear un mapa de órdenes con sus pickings
    const pickingsMap = {};
    pickingData.forEach((picking) => {
      if (!pickingsMap[picking.origin]) {
        pickingsMap[picking.origin] = [];
      }
      pickingsMap[picking.origin].push(picking);
    });

    // Filtrar órdenes con picking pendiente
    const filteredSalesOrders = salesOrders
      .filter((order) => pickingsMap[order.name])
      .map((order) => ({
        id: order.name,
        id_link: order.id,
        partner_name: order.partner_id[1],
        subtotal: order.amount_untaxed,
        total: order.amount_total,
        date_order: convertUTCtoTijuanaTime(order.date_order),
        website_name: order.website_id[1],
        delivery_type:
          partnersMap[order.partner_id[0]] === "Tijuana"
            ? "Envío local"
            : "Envío exterior",
        city: partnersMap[order.partner_id[0]] || "N/A",
      }));

    return NextResponse.json({ salesOrders: filteredSalesOrders }, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "Surrogate-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("Error processing GET request:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
