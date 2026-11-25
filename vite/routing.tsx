import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import About from "./About/About.jsx";
import { Dashboard } from "./Dashboard.jsx";
import Home from "./Home.jsx";
import { Loading } from "./Loading.jsx";
import { SharePage } from "./Share/page.jsx";
import { UserPage } from "./VideoPage/user-page.jsx";
import { UserVideoContextProvider } from "./context.jsx";

// const TanStackRouterDevtools =
//   process.env.NODE_ENV === "production"
//     ? () => null // Render nothing in production
//     : React.lazy(() =>
//         // Lazy load in development
//         import("@tanstack/router-devtools").then((res) => ({
//           default: res.TanStackRouterDevtools,
//           // For Embedded Mode
//           // default: res.TanStackRouterDevtoolsPanel
//         })),
//       );

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      {/* <TanStackRouterDevtools /> */}
    </>
  ),
});

/**
 * INDEX ROUTE
 */
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Home,
});

/**
 * USER ROUTES
 */

export const userRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$username",
  component: () => (
    <UserVideoContextProvider>
      <Outlet />
    </UserVideoContextProvider>
  ),
});

export const videoRoute = createRoute({
  getParentRoute: () => userRoute,
  path: "/",
  component: UserPage,
});

export const shareRoute = createRoute({
  getParentRoute: () => userRoute,
  path: "share",
  component: SharePage,
  validateSearch: (search: { platform?: "twitter" | "linkedin" }) => {
    // validate and parse the search params into a typed state
    return {
      platform: search?.platform,
    };
  },
});

/**
 * ABOUT ROUTE
 */

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/about",
  component: About,
});

/**
 * LOADING ROUTE
 */

const loadingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/loading/$username",
  component: Loading,
});

/**
 * DASHBOARD ROUTE
 */

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: Dashboard,
});
// Create the route tree using your routes
const routeTree = rootRoute.addChildren([
  indexRoute,
  aboutRoute,
  loadingRoute,
  userRoute.addChildren([videoRoute, shareRoute]),
  dashboardRoute,
]);

// Create the router using your route tree
export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
