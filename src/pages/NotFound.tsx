import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-lg mx-auto text-center">
        <h1 className="text-xl font-bold text-gray-900 mt-20">Page not found</h1>
        <p className="text-gray-500 mt-2">That address does not match anything here.</p>
        <Link to="/" className="mt-4 inline-block text-indigo-600 font-medium hover:underline">
          Back to Home
        </Link>
      </div>
    </div>
  )
}
