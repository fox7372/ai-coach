import axios from 'axios'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  timeout: 120000,
})

http.interceptors.response.use(
  (response) => response.data,
  (error) => Promise.reject(error),
)
