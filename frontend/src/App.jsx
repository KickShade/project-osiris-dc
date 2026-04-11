import { useState } from "react";

function getErrorMessage(payload, fallbackMessage) {
  if (!payload) {
    return fallbackMessage;
  }

  if (typeof payload === "string") {
    return payload;
  }

  return payload.detail || payload.message || payload?.error?.message || fallbackMessage;
}

async function readResponsePayload(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const rawText = await response.text();
  return rawText ? { raw: rawText } : {};
}

function getFilenameFromDisposition(headerValue, fallbackName) {
  if (!headerValue) {
    return fallbackName;
  }

  const filenameMatch = headerValue.match(/filename\*?=(?:UTF-8''|\")?([^";\n]+)/i);
  if (!filenameMatch || !filenameMatch[1]) {
    return fallbackName;
  }

  const decoded = decodeURIComponent(filenameMatch[1].replace(/\"/g, "").trim());
  return decoded || fallbackName;
}

export default function App() {
  const [jwtServiceUrl, setJwtServiceUrl] = useState("http://localhost:8000");
  const [orchestratorUrl, setOrchestratorUrl] = useState("http://localhost:3000");

  const [username, setUsername] = useState("test_client");
  const [password, setPassword] = useState("shirts");

  const [selectedFile, setSelectedFile] = useState(null);
  const [downloadFileId, setDownloadFileId] = useState("");

  const [token, setToken] = useState(() => localStorage.getItem("jwt_access_token") || "");
  const [jwtResponseText, setJwtResponseText] = useState("");
  const [uploadResponseText, setUploadResponseText] = useState("");
  const [filesResponseText, setFilesResponseText] = useState("");
  const [files, setFiles] = useState([]);
  const [statusMessage, setStatusMessage] = useState("");

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isListing, setIsListing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  function saveToken(accessToken) {
    localStorage.setItem("jwt_access_token", accessToken);
    setToken(accessToken);
  }

  function clearToken() {
    localStorage.removeItem("jwt_access_token");
    localStorage.removeItem("jwt_response");
    setToken("");
    setStatusMessage("Token cleared from localStorage.");
  }

  function getTokenOrThrow() {
    const stored = localStorage.getItem("jwt_access_token") || token;
    if (!stored) {
      throw new Error("Missing token. Login first.");
    }
    return stored;
  }

  async function handleLogin(event) {
    event.preventDefault();
    setStatusMessage("");

    try {
      setIsLoggingIn(true);

      const loginPayload = { username, password };
      const response = await fetch(`${jwtServiceUrl}/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(loginPayload)
      });

      const payload = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "Login failed."));
      }

      const accessToken = payload?.access_token;
      if (!accessToken) {
        throw new Error("Login response did not include access_token.");
      }

      saveToken(accessToken);
      localStorage.setItem("jwt_response", JSON.stringify(payload));

      setJwtResponseText(JSON.stringify(payload, null, 2));
      setStatusMessage("Login successful. Token saved in localStorage.");
    } catch (error) {
      setStatusMessage(error.message || "Login failed.");
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleUpload(event) {
    event.preventDefault();
    setStatusMessage("");

    try {
      if (!selectedFile) {
        throw new Error("Choose a file before uploading.");
      }

      setIsUploading(true);
      const savedToken = getTokenOrThrow();

      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(`${orchestratorUrl}/upload`, {
        method: "POST",
        headers: {
          Authorization: savedToken
        },
        body: formData
      });

      const payload = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "File upload failed."));
      }

      setUploadResponseText(JSON.stringify(payload, null, 2));
      setStatusMessage("Upload successful.");
    } catch (error) {
      setStatusMessage(error.message || "File upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleListFiles() {
    setStatusMessage("");

    try {
      setIsListing(true);
      const savedToken = getTokenOrThrow();

      const response = await fetch(`${orchestratorUrl}/files`, {
        method: "GET",
        headers: {
          Authorization: savedToken
        }
      });

      const payload = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "Could not fetch files."));
      }

      const listedFiles = Array.isArray(payload?.files) ? payload.files : [];
      setFiles(listedFiles);
      setFilesResponseText(JSON.stringify(payload, null, 2));
      setStatusMessage(`Fetched ${listedFiles.length} file(s).`);
    } catch (error) {
      setStatusMessage(error.message || "Could not fetch files.");
    } finally {
      setIsListing(false);
    }
  }

  async function handleDownloadFile(fileIdFromUi) {
    setStatusMessage("");

    try {
      const targetFileId = (fileIdFromUi || downloadFileId).trim();
      if (!targetFileId) {
        throw new Error("Enter a file ID to download.");
      }

      setIsDownloading(true);
      const savedToken = getTokenOrThrow();

      const response = await fetch(`${orchestratorUrl}/download/${encodeURIComponent(targetFileId)}`, {
        method: "GET",
        headers: {
          Authorization: savedToken
        }
      });

      if (!response.ok) {
        const errorPayload = await readResponsePayload(response);
        throw new Error(getErrorMessage(errorPayload, "File download failed."));
      }

      const blob = await response.blob();
      const dispositionHeader = response.headers.get("content-disposition");
      const downloadName = getFilenameFromDisposition(dispositionHeader, `${targetFileId}.bin`);

      // Create a temporary link to trigger browser download for binary content.
      const blobUrl = window.URL.createObjectURL(blob);
      const tempLink = document.createElement("a");
      tempLink.href = blobUrl;
      tempLink.download = downloadName;
      document.body.appendChild(tempLink);
      tempLink.click();
      tempLink.remove();
      window.URL.revokeObjectURL(blobUrl);

      setStatusMessage(`Download started: ${downloadName}`);
    } catch (error) {
      setStatusMessage(error.message || "File download failed.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="page">
      <div className="panel">
        <h1>Distributed Storage Frontend</h1>
        <p className="subtitle">Login, upload, list, and download workflow.</p>

        <section>
          <h2>Service Targets</h2>
          <label>
            JWT Service URL
            <input
              value={jwtServiceUrl}
              onChange={(event) => setJwtServiceUrl(event.target.value)}
              placeholder="http://localhost:8000"
            />
          </label>
          <label>
            Orchestrator URL
            <input
              value={orchestratorUrl}
              onChange={(event) => setOrchestratorUrl(event.target.value)}
              placeholder="http://localhost:3000"
            />
          </label>
        </section>

        <form onSubmit={handleLogin}>
          <section>
            <h2>Task 1: Login and Token Storage</h2>
            <label>
              Username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="alice"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="password123"
              />
            </label>
            <div className="buttonRow">
              <button type="submit" disabled={isLoggingIn}>
                {isLoggingIn ? "Logging in..." : "Login"}
              </button>
              <button type="button" className="secondary" onClick={clearToken}>
                Clear Token
              </button>
            </div>
          </section>
        </form>

        <form onSubmit={handleUpload}>
          <section>
            <h2>Task 2: Upload File</h2>
            <label>
              File
              <input
                type="file"
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              />
            </label>
            <div className="buttonRow">
              <button type="submit" disabled={isUploading}>
                {isUploading ? "Uploading..." : "Upload to /upload"}
              </button>
            </div>
          </section>
        </form>

        <section>
          <h2>Task 3: List Files</h2>
          <div className="buttonRow">
            <button type="button" onClick={handleListFiles} disabled={isListing}>
              {isListing ? "Loading..." : "Fetch /files"}
            </button>
          </div>
          {files.length > 0 && (
            <div className="fileList">
              {files.map((file) => {
                const fileId = file.fileId || file._id || "";
                const fileName = file.fileName || "Unnamed file";
                return (
                  <div className="fileCard" key={fileId || fileName}>
                    <strong>{fileName}</strong>
                    <span>{fileId || "No fileId in payload"}</span>
                    {fileId && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => handleDownloadFile(fileId)}
                        disabled={isDownloading}
                      >
                        Download
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h2>Task 4: Download File by ID</h2>
          <label>
            File ID
            <input
              value={downloadFileId}
              onChange={(event) => setDownloadFileId(event.target.value)}
              placeholder="paste fileId here"
            />
          </label>
          <div className="buttonRow">
            <button
              type="button"
              onClick={() => handleDownloadFile()}
              disabled={isDownloading}
            >
              {isDownloading ? "Downloading..." : "Download from /download/:fileId"}
            </button>
          </div>
        </section>

        <p className="status">{statusMessage}</p>

        <section>
          <h2>Saved Token</h2>
          <pre>{token || "No token saved."}</pre>
        </section>

        <section>
          <h2>JWT Response</h2>
          <pre>{jwtResponseText || "No login response yet."}</pre>
        </section>

        <section>
          <h2>Upload Response</h2>
          <pre>{uploadResponseText || "No upload response yet."}</pre>
        </section>

        <section>
          <h2>Files Response</h2>
          <pre>{filesResponseText || "No files response yet."}</pre>
        </section>
      </div>
    </div>
  );
}
