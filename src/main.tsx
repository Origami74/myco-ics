import "./debug"; // first — installs console/error capture before anything logs
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EventStoreProvider } from "applesauce-react/providers";
import { eventStore } from "./ics";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EventStoreProvider eventStore={eventStore}>
      <App />
    </EventStoreProvider>
  </StrictMode>,
);
