# Production Deployment Checklist for Render

## Pre-Deployment Setup

### 1. **Environment Variables**
Before deploying to Render, configure these variables in the Render dashboard:

```
DEBUG=False
SECRET_KEY=<generate-a-secure-secret-key>
ALLOWED_HOSTS=<your-app-name>.onrender.com,www.<your-app-name>.onrender.com
CSRF_TRUSTED_ORIGINS=https://<your-app-name>.onrender.com,https://www.<your-app-name>.onrender.com
DATABASE_URL=<postgres-database-url>
ORS_API_KEY=<your-openrouteservice-api-key>
PYTHONUNBUFFERED=1
DJANGO_SETTINGS_MODULE=shu_hall_finder.settings
```

### 2. **Generate a Secure Secret Key**
Replace the default SECRET_KEY with a secure one:

```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

### 3. **Database Setup**
- Create a PostgreSQL database on Render (or use an external database provider)
- Copy the DATABASE_URL and add it to Render environment variables
- Note: SQLite (db.sqlite3) is NOT recommended for production on Render (file-based databases don't persist)

### 4. **Static Files & Media**
- Static files are handled automatically by WhiteNoise
- For media uploads, configure Render's persistent disk or use cloud storage:
  - Option A: Render Disk (limited to 1GB on free tier)
  - Option B: AWS S3, Cloudinary, or similar

### 5. **Deployment Steps**

1. **Push code to Git** (GitHub, GitLab, or Bitbucket)
   ```bash
   git add .
   git commit -m "Prepare for production deployment"
   git push origin main
   ```

2. **Connect repository to Render**
   - Go to https://dashboard.render.com
   - Create new "Web Service"
   - Connect your GitHub repository
   - Select the repository and branch (main)

3. **Configure Render Service**
   - **Name**: shu-hall-finder (or your preferred name)
   - **Environment**: Python 3
   - **Build Command**: 
     ```
     pip install -r requirements.txt && python manage.py migrate && python manage.py collectstatic --noinput
     ```
   - **Start Command**: 
     ```
     gunicorn shu_hall_finder.wsgi --log-file -
     ```
   - **Plan**: Free (or Starter/Standard as needed)

4. **Add Environment Variables**
   - Copy all variables from the "Environment Variables" section above
   - Add them in the Render dashboard

5. **Deploy**
   - Click "Deploy" and monitor the build logs
   - After successful deployment, verify at: https://<your-app-name>.onrender.com

### 6. **Post-Deployment**

1. **Run Migrations** (first time only):
   ```bash
   # Via Render Dashboard Shell:
   python manage.py migrate
   ```

2. **Create Superuser** (first time only):
   ```bash
   # Via Render Dashboard Shell:
   python manage.py createsuperuser
   ```

3. **Collect Static Files** (included in build command, but can run manually):
   ```bash
   python manage.py collectstatic --noinput
   ```

4. **Test the application**:
   - Visit https://<your-app-name>.onrender.com
   - Test login at https://<your-app-name>.onrender.com/admin
   - Test all key features

### 7. **Troubleshooting**

**Error: `ModuleNotFoundError`**
- Ensure all packages are in `requirements.txt`
- Run `pip install -r requirements.txt` locally to verify

**Error: `400 Bad Request`**
- Check ALLOWED_HOSTS and CSRF_TRUSTED_ORIGINS environment variables
- Ensure domain names match exactly (without http/https)

**Static files not loading**
- Verify `STATIC_ROOT` and `STATICFILES_STORAGE` settings
- Check that `collectstatic` runs during build

**Database connection errors**
- Verify DATABASE_URL format: `postgres://user:password@host:port/dbname`
- Ensure database is accessible from Render's network
- Check PostgreSQL SSL requirements

**Media files disappearing**
- Render's ephemeral filesystem deletes files outside `/var/data` on restart
- Implement cloud storage (AWS S3, Cloudinary) for persistent media

### 8. **Optional: Custom Domain**
1. Add your domain to Render settings
2. Update DNS records to point to Render
3. Enable auto-renewal of free SSL certificate

### 9. **Monitoring & Maintenance**
- Set up error tracking (Sentry recommended)
- Monitor logs in Render dashboard
- Regular database backups
- Keep dependencies updated (security patches)

## Files Modified for Production

- ✅ `shu_hall_finder/settings.py` - Production security settings
- ✅ `requirements.txt` - Added production dependencies
- ✅ `Procfile` - Gunicorn configuration
- ✅ `runtime.txt` - Python version specification
- ✅ `.env.example` - Environment variable template
- ✅ `render.yaml` - Render-specific configuration
- ✅ `.gitignore` - Prevent committing sensitive files

## Additional Resources

- Django Deployment Checklist: https://docs.djangoproject.com/en/6.0/howto/deployment/checklist/
- Render Documentation: https://render.com/docs
- Gunicorn Documentation: https://gunicorn.org/
