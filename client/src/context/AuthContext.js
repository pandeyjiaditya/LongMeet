import React, { createContext, useContext, useReducer, useEffect } from "react";
import api from "../services/api";
import { getToken, setToken, removeToken } from "../utils/tokenStorage";

const AuthContext = createContext();

const initialState = {
  user: null,
  token: getToken(),
  loading: true,
  error: null,
};

const authReducer = (state, action) => {
  switch (action.type) {
    case "AUTH_SUCCESS":
      setToken(action.payload.token);
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        loading: false,
        error: null,
      };
    case "USER_LOADED":
      return { ...state, user: action.payload, loading: false };
    case "AUTH_ERROR":
    case "LOGOUT":
      removeToken();
      return {
        ...state,
        user: null,
        token: null,
        loading: false,
        error: action.payload || null,
      };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    default:
      return state;
  }
};

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    if (state.token) {
      loadUser();
    } else {
      dispatch({ type: "AUTH_ERROR" });
    }
  }, []);

  const loadUser = async () => {
    try {
      const res = await api.get("/auth/me");
      dispatch({ type: "USER_LOADED", payload: res.data.user });

      // Silently refresh the token so active users never expire
      try {
        const refreshRes = await api.post("/auth/refresh-token");
        if (refreshRes.data?.token) {
          setToken(refreshRes.data.token);
        }
      } catch {
        // Refresh failed — current token is still valid, ignore
      }
    } catch {
      dispatch({ type: "AUTH_ERROR" });
    }
  };

  const login = async (email, password) => {
    try {
      const res = await api.post("/auth/login", { email, password });
      dispatch({ type: "AUTH_SUCCESS", payload: res.data });
    } catch (err) {
      dispatch({
        type: "AUTH_ERROR",
        payload: err.response?.data?.message || "Login failed",
      });
    }
  };

  const register = async (name, email, password) => {
    try {
      const res = await api.post("/auth/register", { name, email, password });
      dispatch({ type: "AUTH_SUCCESS", payload: res.data });
    } catch (err) {
      dispatch({
        type: "AUTH_ERROR",
        payload: err.response?.data?.message || "Registration failed",
      });
    }
  };

  const googleLogin = async (credential) => {
    try {
      const res = await api.post("/auth/google", { credential });
      dispatch({ type: "AUTH_SUCCESS", payload: res.data });
    } catch (err) {
      dispatch({
        type: "AUTH_ERROR",
        payload: err.response?.data?.message || "Google login failed",
      });
    }
  };

  const updateUser = (updatedUser) => {
    dispatch({ type: "USER_LOADED", payload: updatedUser });
  };

  const logout = () => dispatch({ type: "LOGOUT" });
  const clearError = () => dispatch({ type: "CLEAR_ERROR" });

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        googleLogin,
        updateUser,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
