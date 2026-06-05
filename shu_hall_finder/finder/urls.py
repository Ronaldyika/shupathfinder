from django.contrib.auth.views import LogoutView
from django.urls import path

from . import staff_views
from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("api/halls/", views.api_halls, name="api_halls"),
    path("api/route/", views.api_route, name="api_route"),
    path(
        "accounts/login/",
        staff_views.StaffLoginView.as_view(),
        name="login",
    ),
    path(
        "accounts/logout/",
        LogoutView.as_view(next_page="/"),
        name="logout",
    ),
    path("manage/", staff_views.StaffDashboardView.as_view(), name="staff_dashboard"),
    path(
        "manage/halls/",
        staff_views.HallManageListView.as_view(),
        name="hall_manage_list",
    ),
    path(
        "manage/halls/new/",
        staff_views.HallCreateView.as_view(),
        name="hall_manage_create",
    ),
    path(
        "manage/halls/<int:pk>/edit/",
        staff_views.HallUpdateView.as_view(),
        name="hall_manage_update",
    ),
    path(
        "manage/halls/<int:pk>/delete/",
        staff_views.HallDeleteView.as_view(),
        name="hall_manage_delete",
    ),
]
