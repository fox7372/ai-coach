from fastapi import APIRouter

from app.api.routes import auth_courses, chat, content, health_settings, learning, mistakes, quizzes, resources

api_router = APIRouter()
for route_module in (health_settings, auth_courses, resources, content, quizzes, learning, chat, mistakes):
    api_router.include_router(route_module.router)
