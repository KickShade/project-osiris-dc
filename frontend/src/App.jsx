import { useEffect, useState } from "react";

const JWT_LOGIN_URL = "http://localhost:8000/token";
const ORCHESTRATOR_UPLOAD_URL = "http://localhost:3000/upload";
const ORCHESTRATOR_FILES_URL = "http://localhost:3000/files";
const ORCHESTRATOR_DOWNLOAD_BASE_URL = "http://localhost:3000/download";

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
  const [username, setUsername] = useState("test_client");
  const [password, setPassword] = useState("shirts");

  const [selectedFile, setSelectedFile] = useState(null);
  const [downloadFileId, setDownloadFileId] = useState("");

  const [token, setToken] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [files, setFiles] = useState([]);
  const [statusMessage, setStatusMessage] = useState("");

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isListing, setIsListing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    const savedToken = localStorage.getItem("access_token");
    if (savedToken) {
      setToken(savedToken);
      setIsAuthenticated(true);
    }
  }, []);

  function saveToken(accessToken) {
    localStorage.setItem("access_token", accessToken);
    setToken(accessToken);
  }

  function clearToken() {
    localStorage.removeItem("access_token");
    setToken("");
    setIsAuthenticated(false);
    setStatusMessage("");
  }

  function getTokenOrThrow() {
    const stored = localStorage.getItem("access_token") || token;
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
      const response = await fetch(JWT_LOGIN_URL, {
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
      console.log("JWT Response", payload);
      console.log("Saved Token", accessToken);

      setIsAuthenticated(true);
      setStatusMessage("");
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

      const response = await fetch(ORCHESTRATOR_UPLOAD_URL, {
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

      console.log("Upload Response", payload);
      alert("File Upload Successful!");
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

      const response = await fetch(ORCHESTRATOR_FILES_URL, {
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
      console.log("Files Response", payload);
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

      const response = await fetch(`${ORCHESTRATOR_DOWNLOAD_BASE_URL}/${encodeURIComponent(targetFileId)}`, {
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

      alert("File Downloaded Successfully!");
      setStatusMessage(`Download started: ${downloadName}`);
    } catch (error) {
      setStatusMessage(error.message || "File download failed.");
    } finally {
      setIsDownloading(false);
    }
  }

  function renderLoginView() {
    return (
      <div className="view loginView">
        <section className="card loginCard">
          <h2>Welcome Back</h2>
          <p className="mutedText">Sign in to access your distributed storage dashboard.</p>
          <form onSubmit={handleLogin} className="stackForm">
            <label>
              Username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="test_client"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="shirts"
              />
            </label>
            <div className="buttonRow">
              <button type="submit" disabled={isLoggingIn}>
                {isLoggingIn ? "Logging in..." : "Login"}
              </button>
            </div>
          </form>
          {statusMessage && <p className="status">{statusMessage}</p>}
        </section>
      </div>
    );
  }

  function renderDashboardView() {
    return (
      <div className="view dashboardView">
        <section className="card dashboardHeader">
          <div>
            <h2>Storage Dashboard</h2>
            <p className="mutedText">Upload, browse, and download files from your distributed cluster.</p>
          </div>
          <button type="button" className="secondary" onClick={clearToken}>
            Logout
          </button>
        </section>

        <form onSubmit={handleUpload} className="card uploadCard">
          <div className="sectionTitleRow">
            <h2>Upload File</h2>
          </div>
          <div className="uploadControls">
            <label className="fileInputGroup">
              <span className="labelText">Choose file</span>
              <input
                type="file"
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              />
            </label>
            <button type="submit" disabled={isUploading}>
              {isUploading ? "Uploading..." : "Upload File"}
            </button>
          </div>
        </form>

        <section className="card filesCard">
          <div className="sectionTitleRow">
            <h2>Files</h2>
            <button type="button" onClick={handleListFiles} disabled={isListing}>
              {isListing ? "Loading..." : "Refresh Files"}
            </button>
          </div>

          {files.length > 0 ? (
            <div className="tableWrap">
              <table className="filesTable">
                <thead>
                  <tr>
                    <th>File Name</th>
                    <th>File ID</th>
                    <th className="actionColumn">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file) => {
                    const fileId = file.fileId || file._id || "";
                    const fileName = file.fileName || "Unnamed file";

                    return (
                      <tr key={fileId || fileName}>
                        <td className="fileNameCell">{fileName}</td>
                        <td className="fileIdCell">{fileId || "No fileId in payload"}</td>
                        <td className="actionColumn">
                          {fileId ? (
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => handleDownloadFile(fileId)}
                              disabled={isDownloading}
                            >
                              Download
                            </button>
                          ) : (
                            <span className="mutedText">Unavailable</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mutedText">No files loaded yet. Click "Refresh Files" to fetch data.</p>
          )}
        </section>

        <section className="card quickDownloadCard">
          <h2>Direct Download by File ID</h2>
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
              {isDownloading ? "Downloading..." : "Download"}
            </button>
          </div>
        </section>
        {statusMessage && <p className="status">{statusMessage}</p>}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="panel">
        <h1 className={`appTitle ${!isAuthenticated ? "centeredTitle" : ""}`}>
          Distributed Storage System
        </h1>
        {!isAuthenticated ? renderLoginView() : renderDashboardView()}
      </div>
    </div>
  );
}
