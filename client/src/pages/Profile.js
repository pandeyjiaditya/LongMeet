import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

const Profile = () => {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    name: user?.name || "",
    bio: user?.bio || "",
    phone: user?.phone || "",
  });
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || "");
  const [avatarData, setAvatarData] = useState(null); // base64 to upload
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

  // Password change
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [pwMessage, setPwMessage] = useState({ text: "", type: "" });
  const [changingPw, setChangingPw] = useState(false);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage({ text: "Please select an image file", type: "error" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ text: "Image must be less than 2MB", type: "error" });
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setAvatarPreview(ev.target.result);
      setAvatarData(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setMessage({ text: "Name is required", type: "error" });
      return;
    }

    setSaving(true);
    setMessage({ text: "", type: "" });

    try {
      const payload = {
        name: form.name.trim(),
        bio: form.bio.trim(),
        phone: form.phone.trim(),
      };
      if (avatarData) payload.avatar = avatarData;

      const res = await api.put("/users/profile", payload);
      updateUser(res.data.user);
      setAvatarData(null);
      setMessage({ text: "Profile updated successfully!", type: "success" });
    } catch (err) {
      setMessage({
        text: err.response?.data?.message || "Failed to update profile",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwMessage({ text: "", type: "" });

    if (passwords.newPassword !== passwords.confirmPassword) {
      setPwMessage({ text: "New passwords do not match", type: "error" });
      return;
    }
    if (passwords.newPassword.length < 6) {
      setPwMessage({
        text: "New password must be at least 6 characters",
        type: "error",
      });
      return;
    }

    setChangingPw(true);
    try {
      const res = await api.put("/users/change-password", {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      setPwMessage({ text: res.data.message, type: "success" });
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      setPwMessage({
        text: err.response?.data?.message || "Failed to change password",
        type: "error",
      });
    } finally {
      setChangingPw(false);
    }
  };

  const getInitials = (name) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="profile-container">
      <nav className="navbar">
        <h1 className="logo" onClick={() => navigate("/dashboard")} style={{ cursor: "pointer" }}>
          LongMeet
        </h1>
        <div className="nav-links">
          <button onClick={() => navigate("/dashboard")} className="btn btn-outline btn-sm">
            Dashboard
          </button>
          <button onClick={logout} className="btn btn-outline">
            Logout
          </button>
        </div>
      </nav>

      <main className="profile-main">
        <div className="profile-card">
          <h2>Your Profile</h2>

          {/* Avatar */}
          <div className="profile-avatar-section" onClick={handleAvatarClick}>
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt="Avatar"
                className="profile-avatar-img"
              />
            ) : (
              <div className="profile-avatar-placeholder">
                {getInitials(user?.name)}
              </div>
            )}
            <div className="profile-avatar-overlay">
              <span>📷</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
          </div>
          <p className="profile-avatar-hint">Click to change photo</p>

          {message.text && (
            <p className={`profile-msg ${message.type}`}>{message.text}</p>
          )}

          {/* Profile form */}
          <form onSubmit={handleSaveProfile} className="profile-form">
            <label>
              <span className="profile-label">Name</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>

            <label>
              <span className="profile-label">Email</span>
              <input type="email" value={user?.email || ""} disabled />
            </label>

            <label>
              <span className="profile-label">Bio</span>
              <textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                placeholder="A short bio about yourself..."
                maxLength={200}
                rows={3}
              />
            </label>

            <label>
              <span className="profile-label">Phone</span>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Your phone number"
              />
            </label>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </form>

          {/* Password section */}
          <div className="profile-divider" />
          <h3 className="profile-section-title">Change Password</h3>

          {pwMessage.text && (
            <p className={`profile-msg ${pwMessage.type}`}>{pwMessage.text}</p>
          )}

          <form onSubmit={handleChangePassword} className="profile-form">
            <label>
              <span className="profile-label">Current Password</span>
              <input
                type="password"
                value={passwords.currentPassword}
                onChange={(e) =>
                  setPasswords({ ...passwords, currentPassword: e.target.value })
                }
                required
              />
            </label>

            <label>
              <span className="profile-label">New Password</span>
              <input
                type="password"
                value={passwords.newPassword}
                onChange={(e) =>
                  setPasswords({ ...passwords, newPassword: e.target.value })
                }
                required
                minLength={6}
              />
            </label>

            <label>
              <span className="profile-label">Confirm New Password</span>
              <input
                type="password"
                value={passwords.confirmPassword}
                onChange={(e) =>
                  setPasswords({
                    ...passwords,
                    confirmPassword: e.target.value,
                  })
                }
                required
                minLength={6}
              />
            </label>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={changingPw}
            >
              {changingPw ? "Changing..." : "Change Password"}
            </button>
          </form>

          {/* Account info */}
          <div className="profile-divider" />
          <div className="profile-meta">
            <p>
              <strong>Joined:</strong>{" "}
              {user?.createdAt
                ? new Date(user.createdAt).toLocaleDateString()
                : "N/A"}
            </p>
            {user?.googleId && (
              <p className="profile-google-badge">🔗 Linked with Google</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Profile;
