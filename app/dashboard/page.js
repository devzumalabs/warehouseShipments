"use client";  // Esto indica que este es un Client Component

import React, { useEffect, useState } from 'react';
import Swal from 'sweetalert2'; // Importamos SweetAlert2
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/solid';
import { BeatLoader } from 'react-spinners';

const Page = () => {
    const [orders, setOrders] = useState([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [localCount, setLocalCount] = useState(0);
    const [exteriorCount, setExteriorCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1); // Estado para la página actual
    const recordsPerPage = 4; // Número de registros por página
    const [isLoading, setIsLoading] = useState(true);

    // Función para cargar los datos de envíos
    const fetchOrders = async () => {
        try {
            setIsLoading(true);
            const response = await fetch('/api/odoo'); // Llamar a la API que configuramos previamente
            const data = await response.json();

            if (data.salesOrders) {
                setOrders(data.salesOrders);

                // Calcular el total de envíos locales y exteriores
                const local = data.salesOrders.filter(order => order.delivery_type === 'Envío local').length;
                const exterior = data.salesOrders.filter(order => order.delivery_type === 'Envío exterior').length;

                // Actualizar los contadores
                setPendingCount(data.salesOrders.length);
                setLocalCount(local);
                setExteriorCount(exterior);

                console.log(data.salesOrders)
            }
        } catch (error) {
            console.error('Error al cargar los pedidos:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Ejecutar la función cuando el componente se monta
    useEffect(() => {
        fetchOrders(); // Cargar los pedidos cuando se monta el componente

        // Intervalo para actualizar el tiempo dinámicamente cada 10 minutos
        const interval = setInterval(() => {
            setOrders(prevOrders => [...prevOrders]); // Fuerza una actualización del estado
        }, 600000); // 600,000 milisegundos = 10 minutos

        // Limpiar el intervalo cuando el componente se desmonte
        return () => clearInterval(interval);
    }, []);

    // Función para devolver el estilo del sitio web
    const getWebsiteStyle = (websiteName) => {
        switch (websiteName) {
            case 'Pure Form':
                return { backgroundColor: '#bfdbfe', color: 'black' };
            case 'Limit-x Nutrition':
                return { backgroundColor: '#fde68a', color: 'black' };
            case 'APX Energy':
                return { backgroundColor: '#BFFF6B', color: 'black' };
            default:
                return { backgroundColor: '#17181A', color: 'white' }; // Default color if no match
        }
    };

    // Función para devolver el estilo del badge de tipo de envío con emojis
    const getDeliveryTypeStyle = (deliveryType) => {
        if (deliveryType === 'Envío local') {
            return { style: 'bg-green-200 text-green-800', emoji: '🚚' };
        } else if (deliveryType === 'Envío exterior') {
            return { style: 'bg-red-200 text-red-800', emoji: '🛬' };
        }
        return { style: '', emoji: '' };
    };

    // Obtener los pedidos que se mostrarán en la página actual
    const indexOfLastOrder = currentPage * recordsPerPage;
    const indexOfFirstOrder = indexOfLastOrder - recordsPerPage;
    const currentOrders = orders.slice(indexOfFirstOrder, indexOfLastOrder);

    // Función para cambiar la página
    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    // Calcular el número total de páginas
    const totalPages = Math.ceil(orders.length / recordsPerPage);

    // Función para mostrar la alerta de confirmación con SweetAlert2
    const handleRowClick = (odooLink) => {
        Swal.fire({
            title: '¿Estás seguro?',
            text: "Estás a punto de salir de esta página. ¿Quieres continuar?",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Sí, continuar',
            cancelButtonText: 'Cancelar'
        }).then((result) => {
            if (result.isConfirmed) {
                window.open(odooLink, "_blank"); // Abrir la página de Odoo en una nueva pestaña
            }
        });
    };

    // Función para calcular la diferencia de tiempo en formato legible
    const calculateTimeElapsed = (dateOrder) => {
        // Asumimos que la fecha viene en formato '15/10/2024, 01:46:10 p.m.' (es-MX)
        // Descomponemos la fecha en partes de día, mes, año y hora
        const [datePart, timePart] = dateOrder.split(',').map(part => part.trim());
        
        // Dividimos la fecha en día, mes y año
        const [day, month, year] = datePart.split('/');
    
        // Verificamos si la hora es AM o PM
        let [time, period] = timePart.split(' '); // "01:46:10 p.m." -> ["01:46:10", "p.m."]
        let [hours, minutes, seconds] = time.split(':');
    
        // Convertir a formato de 24 horas si es PM y la hora no es 12
        if (period.toLowerCase() === 'p.m.' && hours !== '12') {
            hours = parseInt(hours, 10) + 12;
        } 
        // Convertir a 0 horas si es AM y la hora es 12
        else if (period.toLowerCase() === 'a.m.' && hours === '12') {
            hours = '00';
        }
    
        // Construimos el formato ISO (YYYY-MM-DDTHH:MM:SS)
        const isoDateString = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
        
        // Convertimos la fecha al objeto Date
        const orderDate = new Date(isoDateString);
        const now = new Date(); // Fecha actual
    
        const diffInMilliseconds = now - orderDate; // Diferencia en milisegundos
        const diffInMinutes = Math.floor(diffInMilliseconds / (1000 * 60)); // Convertir a minutos
    
        if (diffInMinutes < 60) {
            return `${diffInMinutes} min`; // Mostrar minutos si es menor a 60
        } else if (diffInMinutes < 1440) {
            const diffInHours = Math.floor(diffInMinutes / 60); // Convertir a horas
            return `${diffInHours} hrs`;
        } else {
            const diffInDays = Math.floor(diffInMinutes / 1440); // Convertir a días
            return `${diffInDays} días`;
        }
    };
    
    

    // Función para calcular el estado en base al tiempo transcurrido
    const getOrderStatus = (orderDate) => {
        const now = new Date();
        const orderCreationDate = new Date(orderDate);
        const timeDifferenceInHours = (now - orderCreationDate) / (1000 * 60 * 60); // Diferencia en horas

        if (timeDifferenceInHours < 2) {
            return { status: 'En tiempo', style: 'bg-green-200 text-green-500' };
        } else if (timeDifferenceInHours >= 2 && timeDifferenceInHours < 6) {
            return { status: 'Moderado', style: 'bg-orange-200 text-orange-200' };
        } else {
            return { status: 'Retrasado', style: 'bg-red-200 text-red-500' };
        }
    };

    return (
        <div className="w-screen h-screen">
            <div className="container m-auto py-6">
                <h2 className="text-gray-700 text-2xl pb-4 font-semibold">Resumen de envíos</h2>
                <div className="flex w-full gap-5">
                    <div className="flex-1 min-h-52 rounded-3xl flex flex-col align-middle items-center justify-center bg-sky-500">
                        <p className="text-white uppercase font-medium text-sm">
                            Envíos pendientes
                        </p>
                        <h2 className="text-white text-8xl font-bold">
                            {pendingCount}
                        </h2>
                    </div>
                    <div className="flex-1 min-h-52 rounded-3xl flex flex-col align-middle items-center justify-center bg-slate-500">
                        <p className="text-white uppercase font-medium text-sm">
                            Envíos locales
                        </p>
                        <h2 className="text-white text-8xl font-bold">
                            {localCount}
                        </h2>
                    </div>
                    <div className="flex-1 min-h-52 rounded-3xl flex flex-col align-middle items-center justify-center bg-[#16C965]">
                        <p className="text-white uppercase font-medium text-sm">
                            Envíos exterior
                        </p>
                        <h2 className="text-white text-8xl font-bold">
                            {exteriorCount}
                        </h2>
                    </div>
                </div>
                <h2 className="text-gray-700 text-2xl pt-10 pb-4 font-semibold">Historial de envíos</h2>
                <div className={`flex-col rounded-3xl py-3 px-12 bg-white overflow-hidden h-[540px] flex ${isLoading ? 'justify-center items-center' : 'justify-between'}`}>
                    {isLoading ? (
                        <BeatLoader color="#0ea5e9" size={20} />
                    ) : (
                        <>
                            <table className="min-w-full text-gray-700">
                                <thead className="text-left">
                                    <tr className="border-b-2 border-white">
                                        <th className="py-2"># Orden</th>
                                        <th className="py-2">Cliente</th>
                                        <th className="py-2">Fecha de creación</th>
                                        <th className="py-2">Tipo de envío</th>
                                        <th className="py-2">Sitio web</th>
                                        <th className="py-2">Tiempo de registro</th>
                                        <th className="py-2">Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentOrders.map((order, index) => {
                                        const deliveryTypeData = getDeliveryTypeStyle(order.delivery_type);
                                        const odooLink = `https://zumalabs.odoo.com/web?debug=1#id=${order.id_link}&cids=1&menu_id=367&action=613&model=sale.order&view_type=form`;
                                        const orderStatus = getOrderStatus(order.date_order);
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
                                                        {order.website_name === 'Limit-x Nutrition' ? 'Limit X Nutrition' : order.website_name}
                                                    </span>
                                                </td>
                                                <td className="py-6">{calculateTimeElapsed(order.date_order)}</td>
                                                <td className="py-6">
                                                    {/* Estado con badge y texto "Por definir" */}
                                                    <span className={`px-2 py-1 rounded-full font-semibold ${orderStatus.style}`}>
                                                        {orderStatus.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            <div className="footer flex gap-2 justify-end pt-8 pb-4">
                                {Array.from({ length: totalPages }, (_, index) => (
                                    <div
                                        key={index}
                                        onClick={() => paginate(index + 1)}
                                        className={`w-7 h-7 text-white flex justify-center items-center rounded-md ${currentPage === index + 1 ? 'bg-[#0072F6]' : 'bg-[#9ca3af]'} transition duration-300 ease-in-out hover:bg-[#0072F6] hover:cursor-pointer`}
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
    );
};

export default Page;
