# Savers Fund Management System

A full-stack application for managing member contributions, loans, and financial records.

## Features

- **Member Management:** Create and track member accounts.
- **Contribution Tracking:** Record bi-monthly contributions and annual fees.
- **Loan Management:** Process loan applications with automated interest calculation (6% monthly).
- **Repayment Tracking:** Record loan payments and track outstanding balances.
- **Contract Generation:** Generate professional PDF loan agreements.
- **Financial Dashboard:** Real-time overview of total funds, active loans, and collections.

## Tech Stack

- **Frontend:** React 19, Tailwind CSS 4, Lucide React, Motion.
- **Backend:** Express.js, Node.js.
- **Database:** SQLite (via `better-sqlite3`).
- **PDF Generation:** `html-to-image`, `jspdf`.

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm

### Installation

1. Clone the repository (or export from AI Studio).
2. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally

To start the development server:
```bash
npm run dev
```
The application will be available at `http://localhost:3000`.

## Deployment

### AI Studio Hosting
This application is designed to run on **Google Cloud Run** via AI Studio. You can use the **Share** or **Deploy** buttons in the AI Studio interface to host it instantly.

### GitHub Hosting
To host this via GitHub:
1. Use the **Settings > Export to GitHub** feature in AI Studio to sync your code to a repository.
2. Since this is a full-stack Node.js app with a persistent SQLite database, it **cannot** be hosted on GitHub Pages (which is for static sites only).
3. We recommend deploying to services that support Node.js and persistent storage, such as:
   - **Render** (Connect your GitHub repo)
   - **Fly.io**
   - **Railway**

## License

MIT
