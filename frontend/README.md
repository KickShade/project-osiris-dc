# Osiris React Frontend

Workflow implemented in React:

1. Login with JSON credentials to `http://localhost:8000/token`.
2. Extract and store `access_token` in localStorage.
3. Upload file with `POST http://localhost:3000/upload` using `Authorization` header.
4. List files with `GET http://localhost:3000/files` using `Authorization` header.
5. Download by file ID with `GET http://localhost:3000/download/:fileId` using `Authorization` header.

## Run

```bash
cd frontend
npm install
npm run dev
```

Open: http://localhost:5173

## Notes

- Default JWT URL: `http://localhost:8000`
- Default Orchestrator URL: `http://localhost:3000`
- If you get CORS errors from jwt-service, update allowed origins in `JWT-service/symmTokenNew.py`.
