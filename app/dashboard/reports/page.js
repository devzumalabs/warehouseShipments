"use client"; 

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "../../components/Nav";
import Swal from "sweetalert2"; 
import {
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../../firebase";
import { BeatLoader } from "react-spinners";

const Reports = () => {
  const [orders, setOrders] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [localCount, setLocalCount] = useState(0);
  const [exteriorCount, setExteriorCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1); // Estado para la página actual
  const recordsPerPage = 4; // Número de registros por página
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter(); // Usamos useRouter para redireccionar
  const [isAuthenticated, setIsAuthenticated] = useState(null); // Nuevo estado para verificar autenticación
  const [opacity, setOpacity] = useState(0); // Estado para controlar la opacidad
  const [connectedUser, setConnectedUser] = useState(""); // Estado para guardar el nombre completo del usuario
  const [navOpen, setNavOpen] = useState(false); // Estado para controlar la visibilidad del menú

  // Función para alternar el estado
  const toggleNav = () => {
    setNavOpen((prev) => !prev);
  };

  const handleContainerClick = () => {
    if (navOpen) {
      setNavOpen(false);
    }
  };

  //Manejar el filtros
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedWebsite, setSelectedWebsite] = useState("");

  useEffect(() => {
    setOpacity(0); // Inicia el fade-out
    const timer = setTimeout(() => {
      setOpacity(1); // Aplica el fade-in después de 300 ms
    }, 300);
  
    return () => clearTimeout(timer); // Limpia el temporizador si el componente se desmonta
  }, [selectedStatus, selectedWebsite]);  

  const fetchUserFullName = async (email) => {
    try {
      //console.log("Buscando usuario con el correo:", email);

      // Crear una consulta a la colección 'users' donde el campo 'email' coincida con el del usuario autenticado
      const q = query(collection(db, "users"), where("email", "==", email));

      // Obtener los documentos que coincidan con la consulta
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        // Obtener el full_name del primer documento que coincida
        const userDoc = querySnapshot.docs[0].data();
        return userDoc.full_name;
      } else {
        //console.log('No se encontró el usuario con el correo proporcionado.');
        return null;
      }
    } catch (error) {
      console.error("Error al obtener el nombre completo:", error);
      return null;
    }
  };

  // Proteger la página verificando si el usuario está autenticado
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsAuthenticated(false); // Usuario no autenticado
        router.push("/"); // Redirige al login
      } else {
        setIsAuthenticated(true); // Usuario autenticado

        // Asegúrate de que esta parte sea async
        const fullName = await fetchUserFullName(user.email);
        setConnectedUser(fullName); // Guardar el nombre completo en el estado
      }
    });
    return () => unsubscribe();
  }, [router]);

  // Función para cargar los datos de envíos
  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/odoo?_=${Date.now()}`);
      if (!response.ok) {
        throw new Error(`Error en la API: ${response.statusText}`);
      }
      const data = await response.json();

      if (data.salesOrders) {
        setOrders(data.salesOrders);
        setPendingCount(data.salesOrders.length);
        setLocalCount(
          data.salesOrders.filter((o) => o.delivery_type === "Envío local")
            .length
        );
        setExteriorCount(
          data.salesOrders.filter((o) => o.delivery_type === "Envío exterior")
            .length
        );
      }
    } catch (error) {
      console.error("Error al cargar los pedidos:", error.message);
      Swal.fire("Error", "No se pudo cargar la información.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Ejecutar la función cuando el componente se monta
  useEffect(() => {
    if (isAuthenticated) {
      fetchOrders(); // Cargar los pedidos cuando se monta el componente
      setOpacity(1); // Cambia la opacidad a 1 para hacer el "fade in"

      // Intervalo para actualizar el tiempo dinámicamente cada 10 minutos
      const interval = setInterval(() => {
        fetchOrders();
        //console.log('Actualizando dasboard sin refrescar')
      }, 600000); // 600,000 milisegundos = 10 minutos

      // Limpiar el intervalo cuando el componente se desmonte
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  // Mostrar loader mientras se verifica la autenticación
  if (isAuthenticated === null) {
    return <BeatLoader color="#0ea5e9" size={20} />; // Mostrar un loader mientras se verifica la autenticación
  }

  // Función para devolver el estilo del sitio web
  const getWebsiteStyle = (websiteName) => {
    switch (websiteName) {
      case "Pure Form":
        return { backgroundColor: "#bfdbfe", color: "black" };
      case "Limit-X Nutrition":
        return { backgroundColor: "#fde68a", color: "black" };
      case "APX Energy":
        return { backgroundColor: "#BFFF6B", color: "black" };
      default:
        return { backgroundColor: "#17181A", color: "white" }; // Default color if no match
    }
  };

  // Función para devolver el estilo del badge de tipo de envío con emojis
  const getDeliveryTypeStyle = (deliveryType) => {
    if (deliveryType === "Envío local") {
      return { style: "bg-green-200 text-green-800", emoji: "🚚" };
    } else if (deliveryType === "Envío exterior") {
      return { style: "bg-red-200 text-red-800", emoji: "🛬" };
    }
    return { style: "", emoji: "" };
  };

  // Obtener los pedidos que se mostrarán en la página actual
  const indexOfLastOrder = currentPage * recordsPerPage;
  const indexOfFirstOrder = indexOfLastOrder - recordsPerPage;
  const filteredOrders = orders.filter(order => {
    const statusOk = !selectedStatus || getOrderStatus(order.date_order).status === selectedStatus;
    const websiteOk = !selectedWebsite || order.website_name === selectedWebsite;
    return statusOk && websiteOk;
  });
  const currentOrders = filteredOrders.slice(indexOfFirstOrder, indexOfLastOrder);

  // Función para cambiar la página
  const paginate = (pageNumber) => {
    setOpacity(0); // Cambia la opacidad a 0 para el "fade out"
    setTimeout(() => {
      setCurrentPage(pageNumber);
      setOpacity(1); // Vuelve la opacidad a 1 después de cambiar la página
    }, 300); // Tiempo para la animación de "fade out"
  };

  // Calcular el número total de páginas
  const totalPages = Math.ceil(filteredOrders.length / recordsPerPage);

  // Función para mostrar la alerta de confirmación con SweetAlert2
  const handleRowClick = (odooLink) => {
    Swal.fire({
      title: "¿Estás seguro?",
      text: "Estás a punto de salir de esta página. ¿Quieres continuar?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Sí, continuar",
      cancelButtonText: "Cancelar",
    }).then((result) => {
      if (result.isConfirmed) {
        window.open(odooLink, "_blank"); // Abrir la página de Odoo en una nueva pestaña
      }
    });
  };

  // Función para calcular la diferencia de tiempo en un formato legible

  function calculateTimeElapsed(dateOrder) {
    // Separamos la fecha y la hora
    const [datePart, timePart] = dateOrder.split(",").map((part) => part.trim());
    const [day, month, year] = datePart.split("/");

    // Separamos la hora y el indicador AM/PM
    let [time, period] = timePart.split(" ");
    let [hours, minutes, seconds] = time.split(":");

    // Convertir a formato de 24 horas
    if (period.toLowerCase() === "p.m." && hours !== "12") {
      hours = parseInt(hours, 10) + 12;
    } else if (period.toLowerCase() === "a.m." && hours === "12") {
      hours = "00";
    }

    // Construir la cadena en formato ISO (YYYY-MM-DDTHH:MM:SS)
    const isoDateString = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
    const orderDate = new Date(isoDateString);
    const now = new Date();

    // Calcular la diferencia en milisegundos y convertir a minutos
    const diffInMilliseconds = now - orderDate;
    const diffInMinutes = Math.floor(diffInMilliseconds / (1000 * 60));

    // Mostrar el tiempo transcurrido en minutos, horas o días según corresponda
    if (diffInMinutes < 60) {
      return `${diffInMinutes} min`;
    } else if (diffInMinutes < 1440) { // Menos de 24 horas
      const diffInHours = Math.floor(diffInMinutes / 60);
      return `${diffInHours} hrs`;
    } else {
      const diffInDays = Math.floor(diffInMinutes / 1440);
      return `${diffInDays} días`;
    }
  }

  function getOrderStatus(dateOrder) {
    const diffInMinutes = calculateWorkTimeElapsed(dateOrder);
    if (diffInMinutes < 120) {
      return { status: "En tiempo", style: "bg-green-200 text-green-500" };
    } else if (diffInMinutes >= 120 && diffInMinutes < 360) {
      return { status: "Moderado", style: "bg-orange-200 text-orange-500" };
    } else {
      return { status: "Retrasado", style: "bg-red-200 text-red-500" };
    }
  }

  // Función para calcular el tiempo laboral transcurrido (en minutos)
  function calculateWorkTimeElapsed(dateOrder) {
    // Separamos la fecha y la hora
    const [datePart, timePart] = dateOrder.split(",").map((part) => part.trim());
    const [day, month, year] = datePart.split("/");

    // Separamos la hora y el indicador AM/PM
    let [time, period] = timePart.split(" ");
    let [hours, minutes, seconds] = time.split(":");

    // Convertir a formato de 24 horas si es necesario
    if (period.toLowerCase() === "p.m." && hours !== "12") {
      hours = parseInt(hours, 10) + 12;
    } else if (period.toLowerCase() === "a.m." && hours === "12") {
      hours = "00";
    }

    // Creamos la fecha de la orden considerando la zona horaria de Tijuana (UTC-7)
    const orderDate = new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}-07:00`);
    const now = new Date();

    // Si la fecha de la orden es futura, no se ha transcurrido tiempo laboral
    if (orderDate > now) return 0;

    let elapsedMinutes = 0;
    let currentDate = new Date(orderDate);

    // Ajustar la fecha si cae en fin de semana:
    // - Si es sábado, avanzar hasta el lunes a las 8:00 a.m.
    // - Si es domingo, avanzar hasta el lunes a las 8:00 a.m.
    if (currentDate.getDay() === 6) {
      // Sábado
      currentDate.setDate(currentDate.getDate() + 2);
      currentDate.setHours(8, 0, 0, 0);
    } else if (currentDate.getDay() === 0) {
      // Domingo
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(8, 0, 0, 0);
    } else {
      // Si es un día laboral, ajustar al inicio de la jornada (8 a.m.) o al día siguiente si ya pasó la hora límite (3 p.m.)
      if (currentDate.getHours() < 8) {
        currentDate.setHours(8, 0, 0, 0);
      } else if (currentDate.getHours() >= 15) {
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(8, 0, 0, 0);
      }
    }

    // Contamos el tiempo transcurrido solo durante el horario laboral (de lunes a viernes, 8 a.m. a 3 p.m.)
    while (currentDate < now) {
      // Solo contamos si es un día laboral y dentro del horario permitido
      if (
        currentDate.getDay() >= 1 &&
        currentDate.getDay() <= 5 &&
        currentDate.getHours() >= 8 &&
        currentDate.getHours() < 15
      ) {
        elapsedMinutes++;
      }
      currentDate.setMinutes(currentDate.getMinutes() + 1);
    }

    return elapsedMinutes;
  }

  return (
    isAuthenticated && (
      <div
        className="w-full h-screen px-6 sm:px-3 z-0"
        onClick={handleContainerClick}
      >
        <div className="container m-auto py-6 relative">
          <div
            className={`
            z-50
            absolute top-0 right-0 
            transition-all duration-300
            ${navOpen ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"}
          `}
            onClick={(e) => e.stopPropagation()}
          >
            <Nav
              onStatusChange={value => setSelectedStatus(value)}
              onWebsiteChange={value => setSelectedWebsite(value)}
              selectedStatus={selectedStatus}
              selectedWebsite={selectedWebsite}
            />
          </div>
          <div className="flex items-center justify-between pb-2">
            <div>
              <h2 className="text-gray-700 text-1xl font-semibold">
                {connectedUser ? `Hola, ${connectedUser} 👋🏻` : "Cargando..."}
              </h2>
              <h2 className="text-gray-700 text-2xl font-semibold">
                Resumen de envíos 🚀
              </h2>
            </div>
            <div
              className="bg-slate-700 h-8 w-8 flex align-middle justify-center items-center rounded-lg hover:cursor-pointer"
              title="Menú"
              onClick={toggleNav}
            >
              {navOpen ? (
                <svg
                  viewBox="0 0 20 20"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  className="h-5 w-5 text-gray-700"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    fill="#fff"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 20 20"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  className="h-5 w-5 text-gray-700"
                >
                  <path
                    fillRule="evenodd"
                    fill="#fff"
                    d="M18 5a1 1 0 100-2H2a1 1 0 000 2h16zm0 4a1 1 0 100-2h-8a1 1 0 100 2h8zm1 3a1 1 0 01-1 1H2a1 1 0 110-2h16a1 1 0 011 1zm-1 5a1 1 0 100-2h-8a1 1 0 100 2h8z"
                  />
                </svg>
              )}
            </div>
          </div>
          <div className="flex flex-col w-full sm:flex-row gap-5">
            <div className="flex-1 min-h-52 rounded-3xl flex flex-col align-middle items-center justify-center bg-sky-500">
              <p className="text-white uppercase font-medium text-sm">
                Envíos pendientes
              </p>
              <h2 className="text-white text-8xl font-bold">{pendingCount}</h2>
            </div>
            <div className="flex-1 min-h-52 rounded-3xl flex flex-col align-middle items-center justify-center bg-slate-500">
              <p className="text-white uppercase font-medium text-sm">
                Envíos locales
              </p>
              <h2 className="text-white text-8xl font-bold">{localCount}</h2>
            </div>
            <div className="flex-1 min-h-52 rounded-3xl flex flex-col align-middle items-center justify-center bg-[#16C965]">
              <p className="text-white uppercase font-medium text-sm">
                Envíos exterior
              </p>
              <h2 className="text-white text-8xl font-bold">{exteriorCount}</h2>
            </div>
          </div>
          <div className="flex items-center justify-between mt-10 mb-2 gap-2">
            <h2 className="text-gray-700 text-2xl font-semibold">
              Historial de envíos
            </h2>
            <div className="flex gap-3 items-center">
              {(selectedStatus || selectedWebsite) && (
                <span className="text-gray-600 text-sm font-semibold">Filtros aplicados:</span>
              )}
              {selectedStatus && (
                <span
                  className="flex gap-1 items-center align-middle text-xs text-slate-600 font-semibold py-1 px-3 bg-slate-600/15 rounded-full hover:cursor-pointer"
                  onClick={() => setSelectedStatus("")}
                  title="Limpiar filtro de estado"
                >
                  {selectedStatus}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-4 w-4"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm3.53 12.53a.75.75 0 11-1.06 1.06L12 13.06l-2.47 2.47a.75.75 0 11-1.06-1.06L10.94 12 8.47 9.53a.75.75 0 111.06-1.06L12 10.94l2.47-2.47a.75.75 0 111.06 1.06L13.06 12l2.47 2.47Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              )}
              {selectedWebsite && (
                <span
                  className="flex gap-1 items-center align-middle text-xs text-slate-600 font-semibold py-1 px-3 bg-slate-600/15 rounded-full hover:cursor-pointer"
                  onClick={() => setSelectedWebsite("")}
                  title="Limpiar filtro de sitio web"
                >
                  {selectedWebsite}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-4 w-4"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm3.53 12.53a.75.75 0 11-1.06 1.06L12 13.06l-2.47 2.47a.75.75 0 11-1.06-1.06L10.94 12 8.47 9.53a.75.75 0 111.06-1.06L12 10.94l2.47-2.47a.75.75 0 111.06 1.06L13.06 12l2.47 2.47Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              )}
            </div>
          </div>
          <div
            className={`flex-col rounded-3xl py-3 px-12 bg-white overflow-scroll sm:overflow-hidden h-[540px] flex ${isLoading ? "justify-center items-center" : "justify-between"
              }`}
          >
            {isLoading ? (
              <BeatLoader color="#0ea5e9" size={20} />
            ) : (
              <>
                <table className="table-fixed min-w-full text-gray-700">
                  <thead className="text-left">
                    <tr className="border-b-2 border-white">
                      <th className="py-2 min-w-[80px]"># Orden</th>
                      <th className="py-2 min-w-[250px]">Cliente</th>
                      <th className="py-2 min-w-[270px]">Fecha de creación</th>
                      <th className="py-2">Tipo de envío</th>
                      <th className="py-2 min-w-[150px]">Sitio web</th>
                      <th className="py-2">Tiempo de registro</th>
                      <th className="py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody
                    className={`transition-opacity duration-300 ease-in-out`}
                    style={{ opacity: opacity }}
                  >
                    {currentOrders.length === 0 ? (
                      <tr>
                        <td
                          colSpan="7"
                          className="text-center py-6 text-gray-500"
                        >
                          No hay envíos pendientes.
                        </td>
                      </tr>
                    ) : (
                      currentOrders.map((order, index) => {
                        const deliveryTypeData = getDeliveryTypeStyle(order.delivery_type);
                        const orderStatus = getOrderStatus(order.date_order);
                        const odooLink = `${process.env.NEXT_PUBLIC_ODOO_LINK}odoo/sales/${order.id_link}`;

                        return (
                          <tr
                            key={index}
                            className="border-b border-gray-200 hover:bg-[#f2f6f9] hover:cursor-pointer transition duration-300 ease-in-out"
                            onClick={() => handleRowClick(odooLink)} // Alerta de confirmación antes de abrir el enlace
                          >
                            <td className="py-6 text-500">
                              <span className="text-sky-500 px-2 py-1 rounded-full font-semibold bg-sky-100">
                                {order.id}
                              </span>
                            </td>
                            <td className="py-6">{order.partner_name}</td>
                            <td className="py-6">{order.date_order}</td>
                            <td className="py-6">
                              {/* Badge con emoji para el tipo de envío */}
                              <div className="rounded-full font-semibold h-12 w-12 flex justify-center items-center">
                                <p className="text-3xl">
                                  {deliveryTypeData.emoji}
                                </p>
                              </div>
                            </td>
                            <td className="py-6">
                              {/* Estilos dinámicos según el sitio web */}
                              <span
                                className="px-2 py-1 rounded-full font-medium"
                                style={getWebsiteStyle(order.website_name)}
                              >
                                {order.website_name === "Limit-X Nutrition"
                                  ? "Limit-X Nutrition"
                                  : order.website_name}
                              </span>
                            </td>
                            <td className="py-6">
                              {calculateTimeElapsed(order.date_order)}
                            </td>
                            <td className="py-6">
                              <span
                                className={`px-2 py-1 rounded-full inline-block font-semibold ${orderStatus.style} ${orderStatus.status === "Retrasado" ? "animate-shake" : ""
                                  }`}
                              >
                                {orderStatus.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
                <div className="footer flex gap-2 justify-end pt-8 pb-4">
                  {Array.from({ length: totalPages }, (_, index) => (
                    <div
                      key={index}
                      onClick={() => paginate(index + 1)}
                      className={`w-7 h-7 text-white flex justify-center items-center rounded-md ${currentPage === index + 1
                        ? "bg-[#0072F6]"
                        : "bg-[#9ca3af]"
                        } transition duration-300 ease-in-out hover:bg-[#0072F6] hover:cursor-pointer`}
                    >
                      {index + 1}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  );
};

export default Reports;
