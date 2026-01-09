import * as React from "react";
import { Socket as IOSocket } from "socket.io-client";
import { createEnvironment } from "./relay-environment";
import { RelayEnvironmentProvider } from "relay-hooks";
import { useStaticRef } from "./hooks/use-static-ref";
import { SplashScreen } from "./splash-screen";
import styled from "@emotion/styled/macro";
import { SoundSettingsProvider } from "./sound-settings";
import { SplashShareImage } from "./splash-share-image";

const Container = styled.div`
  display: flex;
  height: 100%;
  position: relative;
  overflow: hidden;
`;

const AuthenticatedAppShellRenderer: React.FC<{ isMapOnly: boolean }> = ({
  isMapOnly,
  children,
}) => {
  return (
    <Container>
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {children}
      </div>
      <SplashShareImage />
    </Container>
  );
};

type ConnectionMode =
  | "connected"
  | "authenticating"
  | "authenticated"
  | "connecting"
  | "disconnected";

export type AuthenticatedRole = "DM" | "Player";

const RoleContext = React.createContext<AuthenticatedRole>("Player");

export const useViewerRole = (): AuthenticatedRole =>
  React.useContext(RoleContext);

export const AuthenticatedAppShell: React.FC<{
  socket: IOSocket;
  password: string;
  isMapOnly: boolean;
  role: AuthenticatedRole;
}> = ({ socket, password, isMapOnly, role, children }) => {
  const relayEnvironment = useStaticRef(() => createEnvironment(socket));
  // WebSocket connection state
  const [connectionMode, setConnectionMode] =
    React.useState<ConnectionMode>("connecting");

  /**
   * We only use one tab at a time. The others will be disconnected automatically upon opening dungeon-revealer in another tab.
   * You can still use dungeon-revealer in two tabs by using the incognito mode of the browser.
   * We do this in order to prevent message/user connect/music sound effect spamming.
   */
  React.useEffect(() => {
    const authenticate = () => {
      socket.emit("authenticate", {
        password: password,
        desiredRole: role === "DM" ? "admin" : "user",
      });
    };

    socket.on("connect", () => {
      setConnectionMode("connected");
      authenticate();
    });

    socket.on("authenticated", () => {
      setConnectionMode("authenticated");
    });

    socket.on("reconnect", () => {
      setConnectionMode("authenticating");
      socket.emit("authenticate", { password: password });
    });

    socket.on("disconnect", () => {
      setConnectionMode("disconnected");
    });

    if (socket.connected) {
      authenticate();
    }

    const tabId = String(
      parseInt(localStorage.getItem("app.tabId") || "0", 10) + 1
    );
    localStorage.setItem("app.tabId", tabId);
    localStorage.setItem("app.activeTabId", tabId);

    window.addEventListener("storage", (ev) => {
      if (ev.key === "app.activeTabId" && ev.newValue !== tabId) {
        socket.disconnect();
      }
    });

    window.addEventListener("focus", () => {
      localStorage.setItem("app.activeTabId", tabId);
      if (!socket.connected) {
        socket.connect();
      }
    });

    return () => {
      socket.off("connect");
      socket.off("reconnecting");
      socket.off("reconnect");
      socket.off("reconnect_failed");
      socket.off("disconnect");
    };
  }, [socket, password]);

  if (connectionMode !== "authenticated") {
    return <SplashScreen text={connectionMode} />;
  }

  return (
    <RoleContext.Provider value={role}>
      <SoundSettingsProvider>
        <RelayEnvironmentProvider environment={relayEnvironment}>
          <AuthenticatedAppShellRenderer isMapOnly={isMapOnly}>
            {children}
          </AuthenticatedAppShellRenderer>
        </RelayEnvironmentProvider>
      </SoundSettingsProvider>
    </RoleContext.Provider>
  );
};
