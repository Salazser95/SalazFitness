"""
Root urlconf for the salaz-enabled server.

Wraps wger.urls unchanged and adds salaz's own urlpatterns (the
/api/v2/salaz/* router) on top, per DJANGO_SETTINGS_MODULE=salaz_settings.

Note: wger.urls builds its urlpatterns with i18n_patterns(), and Django
refuses to include() a urlconf module built that way ("Using i18n_patterns
in an included URLconf is not allowed."). So instead of include('wger.urls'),
we import its already-built urlpatterns list and concatenate it directly,
exactly like wger/urls.py itself does at its own bottom
(`urlpatterns += [...]`). wger.urls is not modified.
"""

from wger.urls import urlpatterns as wger_urlpatterns

from salaz.urls import urlpatterns as salaz_urlpatterns

urlpatterns = wger_urlpatterns + salaz_urlpatterns
