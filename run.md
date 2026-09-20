# How to Start the Project

To start the entire project (both the backend API and the frontend Next.js application), you will need two separate terminal windows.

## 1. Start the Backend (FastAPI)
Open a terminal in the root directory (`DeadLock`) and run the following command to start the Python backend on port 8100:

```bash
python -m uvicorn studyhub.web.app:app --port 8100
```

## 2. Start the Frontend (Next.js)
Open a second terminal, navigate into the `frontend` directory, and start the Next.js development server on port 3000:

```bash
cd frontend
npm run dev
```

Once both servers have successfully started, you can access the application by navigating to [http://localhost:3000](http://localhost:3000) in your web browser.

---

### Quick Start Script (PowerShell)
If you prefer to start both processes at the same time from a single script on Windows, you can run the following PowerShell command in the root directory:

```powershell
Start-Process powershell -ArgumentList "-NoExit -Command python -m uvicorn studyhub.web.app:app --port 8100"; Start-Process powershell -ArgumentList "-NoExit -Command cd frontend; npm run dev"
```

