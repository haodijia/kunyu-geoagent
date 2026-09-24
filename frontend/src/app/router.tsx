import { Navigate, createHashRouter } from "react-router-dom";

import { ConnectionStatusPage } from "../features/system/ConnectionStatusPage";

export const router = createHashRouter([
  {
    path: "/",
    element: <ConnectionStatusPage />
  },
  {
    path: "*",
    element: <Navigate to="/" replace />
  }
]);
