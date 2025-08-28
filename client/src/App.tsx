import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClerkWrapper } from "./components/clerk-provider";
import NotFound from "./pages/not-found";
import Home from "./pages/home";
// import Home from "./pages/home-restored";
import LineSettings from "./pages/line-settings";
import SignIn from "./pages/sign-in";

function Router() {
  const [location] = useLocation();
  console.log('Current location:', location);

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/line-settings" component={LineSettings} />
      {/* <Route path="/sign-in" component={SignIn} /> */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ClerkWrapper>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkWrapper>
  );
}

export default App;
