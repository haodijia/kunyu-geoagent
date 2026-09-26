import { Navigate, createHashRouter } from "react-router-dom";

import { ConnectionStatusPage } from "../features/system/ConnectionStatusPage";
import { AppShell } from "./AppShell";

export const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <ConnectionStatusPage />
      },
      {
        path: "workspaces/:workspaceId/sessions/:sessionId/overview",
        element: null
      },
      {
        path: "*",
        element: <Navigate to="/" replace />
      }
    ]
  }
]);
