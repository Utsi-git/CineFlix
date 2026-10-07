import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import { BrowserRouter, Switch, Route } from 'react-router-dom';
import App from './App';
import Recommendations from "./Components/Recommendations";
import Profile from "./Components/Profile";
import Footer from "./Components/Footer";
import Navbar from "./Components/Navbar";
import AuthModal from "./Components/AuthModal";
import { AuthProvider } from "./context/AuthContext";

ReactDOM.render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        {/* White rounded card that sits on the blue-gray background */}
        <div className="flix-card-shell">
          <Navbar />
          <Switch>
            <Route exact path="/" component={App} />
            <Route path="/recommend" component={Recommendations} />
            <Route path="/profile" component={Profile} />
            <Route path="/watchlist" component={Profile} />
          </Switch>
          <Footer />
        </div>
        <AuthModal />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
  document.getElementById('root')
);
