"use client"; // Marca este componente como un Client Component

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation'; // Usa next/navigation en lugar de next/router
import { auth, signInWithEmailAndPassword } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const router = useRouter(); // Hook de enrutamiento de next/navigation

  useEffect(() => {
    // Verificar si el usuario ya está autenticado y redirigir al dashboard
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push('/dashboard'); // Redirigir al dashboard si el usuario ya está autenticado
      }
    });
    return () => unsubscribe(); // Limpiar el listener al desmontar el componente
  }, [router]);

  const handleLogin = async (e) => {
    e.preventDefault(); // Evitar que la página se recargue
    setLoading(true);
    setError(null);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/dashboard'); // Redirigir al dashboard después de iniciar sesión
    } catch (error) {
      setError('Error durante el inicio de sesión.');
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold mb-6 text-center">Iniciar Sesión</h1>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">
              Correo Electrónico
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
              Contraseña
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {loading ? 'Cargando...' : 'Iniciar sesión'}
          </button>
        </form>

        <div className="text-center mt-4">
          <p className="text-sm text-gray-600">
            ¿No tienes una cuenta? <a href="#" className="text-blue-500">Regístrate</a>
          </p>
        </div>
      </div>
    </div>
  );
}
