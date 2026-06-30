import axios from 'axios'

function getDefaultApiBaseUrl() {
  if (typeof window === 'undefined') return 'http://localhost:8000'
  return `${window.location.protocol}//${window.location.hostname}:8000`
}

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || getDefaultApiBaseUrl(),
  timeout: 120000,
})

http.interceptors.response.use(
  (response) => response.data,
  (error) => Promise.reject(error),
)
