import { NextResponse } from "next/server";
import { AbortController } from "abort-controller";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

    const response = await fetch(
      `${odooUrl}/web/session/authenticate?_=${Date.now()}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          params: {
            db: dbName,
            login: username,
            password: password,
          },
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.data.message);
    }

    // Extraemos session_id de la cabecera "set-cookie"
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
  // Transformamos la cadena a un formato ISO válido interpretado como UTC
  // Reemplazamos el primer espacio por "T" y le agregamos "Z" al final.
  const isoString = dateString.replace(" ", "T") + "Z";
  const date = new Date(isoString);
  if (isNaN(date)) return "Invalid date";

  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Tijuana",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
};

// Endpoint principal
export async function GET(request) {
  console.log("🚀 [GET] Solicitud recibida a", new Date().toISOString());
  try {
    // 1. Autenticación
    const sessionId = await authenticate();
    console.log("✅ Autenticación exitosa, Session ID:", sessionId);

    // 2. Obtener sitios web
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

    // 3. Órdenes de venta en estado "sale" o "done"
    const salesOrders = await fetchData(
      sessionId,
      "sale.order",
      "search_read",
      [
        ["website_id", "in", websiteIds],
        ["state", "in", ["sale", "done"]],
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

    // 4. Obtener la ciudad de los clientes
    const partnerIds = salesOrders.map((order) => order.partner_id[0]);
    const partnersData = await fetchData(
      sessionId,
      "res.partner",
      "search_read",
      [["id", "in", partnerIds]],
      ["id", "city"]
    );
    const partnersMap = Object.fromEntries(
      partnersData.map((partner) => [partner.id, partner.city])
    );

    // 5. Obtener los pickings cuyo destino sea "customer"
    //    Esto filtra realmente los traslados que van al cliente.
    //    Opcional: agregar ["name", "ilike", "CEDIS/OUT/"] si necesitas esa nomenclatura.
    const outPickingData = await fetchData(
      sessionId,
      "stock.picking",
      "search_read",
      [
        ["origin", "in", salesOrders.map((o) => o.name)],
        ["location_dest_id.usage", "=", "customer"]
      ],
      ["origin", "state", "name", "location_dest_id"]
    );

    // 6. Agrupar pickings "out" por orden
    const outPickingsMap = {};
    outPickingData.forEach((picking) => {
      if (!outPickingsMap[picking.origin]) {
        outPickingsMap[picking.origin] = [];
      }
      outPickingsMap[picking.origin].push(picking);
    });

    // 7. Filtrar las órdenes:
    //    - Se muestran solo si tienen al menos un picking con destino "customer"
    //    - Y si ese picking no está en "done" ni "cancel"
    const filteredSalesOrders = salesOrders
      .filter((order) => {
        const outPickings = outPickingsMap[order.name] || [];

        // Si no hay pickings con destino "customer", no se muestra
        if (outPickings.length === 0) {
          return false;
        }

        // Revisamos si hay algún picking con destino "customer" no en 'done' ni 'cancel'
        const anyNotDoneOrCanceled = outPickings.some(
          (p) => !["done", "cancel"].includes(p.state)
        );

        // Mostrar la orden solo si hay al menos un picking OUT pendiente
        return anyNotDoneOrCanceled;
      })
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

    // 8. Respuesta final
    return NextResponse.json(
      { salesOrders: filteredSalesOrders },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
          "Surrogate-Control": "no-store",
        }
      }
    );
  } catch (error) {
    console.error("Error processing GET request:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
