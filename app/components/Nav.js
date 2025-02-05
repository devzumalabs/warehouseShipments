"use client"; // Esto indica que el componente se renderiza en el cliente

import Link from 'next/link';
import { useRouter } from 'next/navigation'; // Importa desde next/navigation
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase'; // Ajusta la ruta según tu configuración

const Nav = ({ onStatusChange, onWebsiteChange, selectedStatus, selectedWebsite  }) => {
  const router = useRouter();

  // Función para cerrar sesión
  const handleLogout = async () => {
    try {
      await signOut(auth); // Cierra la sesión de Firebase
      router.push("/");    // Redirige al usuario a la página principal
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  return (
    <nav className="absolute top-20 right-0 bg-slate-600 shadow-md rounded-md w-70 py-6 px-4">
      <ul className="flex flex-col  justify-center gap-3">
        <li className="flex flex-col bg-slate-500 py-5 px-4 rounded-lg">
          <div className="flex text-white gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" className="size-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 13.5V3.75m0 9.75a1.5 1.5 0 0 1 0 3m0-3a1.5 1.5 0 0 0 0 3m0 3.75V16.5m12-3V3.75m0 9.75a1.5 1.5 0 0 1 0 3m0-3a1.5 1.5 0 0 0 0 3m0 3.75V16.5m-6-9V3.75m0 3.75a1.5 1.5 0 0 1 0 3m0-3a1.5 1.5 0 0 0 0 3m0 9.75V10.5" />
            </svg>
            <h2 className="text-white">
              Filtros
            </h2>
          </div>
          <hr className="border-slate-400 w-full mt-2 mb-2"/>
          <span className="text-white mb-2">Estado:</span>
          <select
            className="border border-slate-400 rounded-lg px-2 py-2 bg-slate-500 text-white hover:cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent"
            value={selectedStatus}
            onChange={(e) => onStatusChange(e.target.value)} 
          >
            <option value="">Selecciona un estado</option>
            <option value="En tiempo">En tiempo</option>
            <option value="Moderado">Moderado</option>
            <option value="Retrasado">Retrasado</option>
          </select>
          <span className="text-white mb-2 mt-4">Sitio web:</span>
          <select
            className="border border-slate-400 rounded-lg px-2 py-2 bg-slate-500 text-white hover:cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent"
            value={selectedWebsite}
            onChange={(e) => onWebsiteChange(e.target.value)}
          >
            <option value="">Selecciona un sitio web</option>
            <option value="Pure Form">Pure Form</option>
            <option value="APX Energy">APX Energy</option>
            <option value="Limit-X Nutrition">Limit-X Nutrition</option>
          </select>
        </li>
        <li 
          className="flex text-white gap-2 cursor-pointer hover:bg-slate-500 py-2 px-4 transition-colors duration-700 ease-in-out rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" className="size-6">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
          <Link href="/dashboard/reports/">Reportes</Link>
        </li>
        <li 
          className="flex text-white gap-2 bg-red-500 cursor-pointer py-2 px-4 transition-colors duration-700 ease-in-out rounded-lg" 
          onClick={handleLogout}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-6 w-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15"
            />
          </svg>
          <Link href="/">Cerrar sesión</Link>
        </li>
      </ul>
    </nav>
  );
};

export default Nav;
