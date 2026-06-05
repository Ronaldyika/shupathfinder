from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.contrib.auth.views import LoginView
from django.contrib.messages.views import SuccessMessageMixin
from django.urls import reverse, reverse_lazy
from django.views.generic import CreateView, DeleteView, ListView, TemplateView, UpdateView

from .forms import HallForm
from .models import Hall


class StaffLoginView(LoginView):
    """Staff go to the dashboard after login; other users return home (avoids 403 on /manage/)."""

    template_name = "finder/auth/login.html"
    redirect_authenticated_user = True

    def get_success_url(self):
        redirect_to = self.get_redirect_url()
        if redirect_to and self.request.user.is_staff:
            return redirect_to
        if redirect_to and not self.request.user.is_staff:
            if "/manage" not in redirect_to:
                return redirect_to
        if self.request.user.is_staff:
            return reverse("staff_dashboard")
        return reverse("home")

    def form_valid(self, form):
        response = super().form_valid(form)
        if not self.request.user.is_staff:
            messages.info(
                self.request,
                "You are signed in. Only accounts with staff status can manage halls.",
            )
        return response


class StaffRequiredMixin(LoginRequiredMixin, UserPassesTestMixin):
    login_url = reverse_lazy("login")

    def test_func(self):
        u = self.request.user
        return u.is_authenticated and u.is_staff


class StaffDashboardView(StaffRequiredMixin, TemplateView):
    template_name = "finder/manage/dashboard.html"


class HallManageListView(StaffRequiredMixin, ListView):
    model = Hall
    template_name = "finder/manage/hall_list.html"
    context_object_name = "halls"
    paginate_by = 25


class HallCreateView(StaffRequiredMixin, SuccessMessageMixin, CreateView):
    model = Hall
    form_class = HallForm
    template_name = "finder/manage/hall_form.html"
    success_url = reverse_lazy("hall_manage_list")
    success_message = 'Hall “%(name)s” was created successfully.'

    def get_success_message(self, cleaned_data):
        return self.success_message % {"name": cleaned_data.get("name", "")}


class HallUpdateView(StaffRequiredMixin, SuccessMessageMixin, UpdateView):
    model = Hall
    form_class = HallForm
    template_name = "finder/manage/hall_form.html"
    success_url = reverse_lazy("hall_manage_list")
    success_message = 'Hall “%(name)s” was updated successfully.'

    def get_success_message(self, cleaned_data):
        return self.success_message % {"name": cleaned_data.get("name", "")}


class HallDeleteView(StaffRequiredMixin, DeleteView):
    model = Hall
    template_name = "finder/manage/hall_confirm_delete.html"
    success_url = reverse_lazy("hall_manage_list")
    context_object_name = "hall"

    def delete(self, request, *args, **kwargs):
        name = self.get_object().name
        messages.success(request, f'Hall “{name}” was deleted.')
        return super().delete(request, *args, **kwargs)
