# RCS Attendance Manager

A lightweight, efficient Attendance Management System designed for tracking employee attendance, designation details, casual and festive leaves, and national holidays.

[![Deploy to Render](https://render.com/images/deploy-to-render.svg)](https://render.com/deploy?repo=https://github.com/Tanush147/RCS)

## Features
- **Supervisor Dashboard**: Mark daily attendance (Present, Absent, Casual Leave, Festive Leave, National Holiday, Week Off) and log overtime hours.
- **Admin Dashboard**: Manage departments, track total monthly attendance metrics, and configure working days.
- **Excel Export**: Export monthly attendance and overtime data directly to Excel format.
- **Local SQLite Storage**: Fast, zero-configuration local database.

## One-Click Deployment to Render
You can deploy this application instantly to Render's Free Instance Tier:
1. Click the **Deploy to Render** button above.
2. Render will automatically read the `render.yaml` blueprint from your repository.
3. Review the configuration and click **Apply**.
4. Once deployed, Render will provide a public URL for your application.

> [!IMPORTANT]
> **Data Persistence Warning for Render Free Tier**:
> The Render Free Tier does not support persistent disk volumes. Any attendance data stored in SQLite will be reset whenever the Free instance restarts (typically once a day or on redeployment). For production use, consider upgrading to Render's Starter plan to mount a persistent disk volume, or configure an external database like Supabase (PostgreSQL).

## Local Development Setup

### Prerequisites
- Node.js (v18 or higher)
- npm

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/Tanush147/RCS.git
   cd RCS
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Access the application at `http://localhost:3000`.
   - **Default Admin Login**: `admin` / `rcs@admin2024`
