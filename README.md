# NNC Daily Ordering - Online Inventory System

Daily inventory tracking system for **Naan N Curry Issaquah**.

## Features

- **91 inventory items** matching your Excel template — curries, meats, produce, dairy, desserts, spices, and supplies
- **AM / PM counts** with auto-calculated usage (AM - PM)
- **Par levels** that adjust automatically for weekdays vs weekends (matching your Excel's M-Th / F-S-S split)
- **Carry-over suggestions** — AM field shows suggested count from previous day's PM + Order
- **7-day history view** with sparkline usage trends
- **Search and filter** — find items instantly, filter by "Needs Order" or "Low Stock"
- **Export daily CSV** for email or records
- **Full JSON backup/restore** to move data between devices
- **Add custom items** through Settings
- **Works on any device** — phone, tablet, or desktop
- **Prints cleanly** for kitchen posting

## Setup on GitHub Pages (Free Hosting)

1. Create a GitHub account at [github.com](https://github.com) if you don't have one
2. Click **"New repository"** (the green button, or go to github.com/new)
3. Name it `nnc-inventory`
4. Set it to **Public**
5. Click **"Create repository"**
6. Click **"uploading an existing file"** link
7. Drag the `index.html` file into the upload area
8. Click **"Commit changes"**
9. Go to **Settings** → **Pages** (in the left sidebar)
10. Under "Source", select **"Deploy from a branch"**
11. Choose **main** branch, **/ (root)** folder
12. Click **Save**
13. Wait 1-2 minutes, then your site will be live at:
    `https://YOUR-USERNAME.github.io/nnc-inventory/`

## Daily Usage

1. Open the site on your phone or computer
2. Navigate to today's date (it opens to today by default)
3. Enter **AM counts** at the start of the day
4. Enter **PM counts** at end of day
5. **Usage** calculates automatically
6. Enter **Order quantities** for what you need tomorrow
7. Hit **Export Day** to download a CSV you can email to suppliers

## Data Storage

Data is stored in your browser's local storage. This means each device keeps its own copy. To sync between devices, use **Backup All** to export a JSON file and **Import Backup** on the other device.
