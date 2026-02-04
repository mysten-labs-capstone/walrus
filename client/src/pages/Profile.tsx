import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "../components";
import { authService } from "../services/authService";
import { apiUrl } from "../config/api";
import {
  deriveKeysFromPassword,
  deriveKeysFromPasswordWithSalt,
  encryptMasterKey,
  decryptMasterKey,
} from "../services/keyDerivation";
import { Eye, EyeOff, Lock, User as UserIcon } from "lucide-react";
import "./css/Profile.css";

export const Profile: React.FC = () => {
  const navigate = useNavigate();
  const user = authService.getCurrentUser();

  const [privateKey, setPrivateKey] = useState<string>("");
  const [showKey, setShowKey] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Signup-like validation state
  const [confirmPasswordError, setConfirmPasswordError] = useState(false);
  const [passwordInvalidOnSubmit, setPasswordInvalidOnSubmit] = useState(false);
  const [changeAttempted, setChangeAttempted] = useState(false);
  const [confirmPasswordMessage, setConfirmPasswordMessage] = useState("");

  // Inline current-password error (shown above Change Password, highlighted)
  const [currentPasswordMessage, setCurrentPasswordMessage] = useState("");
  const [currentPasswordError, setCurrentPasswordError] = useState(false);

  const getPasswordValidation = () => {
    if (!newPassword)
      return {
        hasMinLength: false,
        hasUppercase: false,
        hasLowercase: false,
        hasNumber: false,
        hasSpecial: false,
      };
    return {
      hasMinLength: newPassword.length >= 8,
      hasUppercase: /[A-Z]/.test(newPassword),
      hasLowercase: /[a-z]/.test(newPassword),
      hasNumber: /[0-9]/.test(newPassword),
      hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(newPassword),
    };
  };

  const passwordValidation = getPasswordValidation();
  const isPasswordValid = Object.values(passwordValidation).every(Boolean);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    fetchPrivateKey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  const fetchPrivateKey = async () => {
    try {
      setLoading(true);
      setError("");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(
        apiUrl(`/api/auth/profile?userId=${user?.id}`),
        {
          signal: controller.signal,
        },
      );

      clearTimeout(timeoutId);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load profile");
      }

      setPrivateKey(data.privateKey);
    } catch (err: any) {
      console.error("[Profile] Failed to load encryption key:", err);
      if (err.name === "AbortError") {
        setError("Request timed out. Please try again.");
      } else {
        setError("Failed to load profile");
      }
    } finally {
      setLoading(false);
    }
  };

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(privateKey);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    } catch (err) {
      alert("Failed to copy to clipboard");
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    // mark attempted so mismatch shows only after submit
    setChangeAttempted(true);
    setPasswordError("");
    setPasswordSuccess("");
    setConfirmPasswordError(false);
    setPasswordInvalidOnSubmit(false);
    setConfirmPasswordMessage("");

    // follow signup flow: check for empty password first
    if (!newPassword.trim()) {
      setPasswordError("Please enter a password");
      return;
    }

    // then check password requirements
    if (!isPasswordValid) {
      setPasswordInvalidOnSubmit(true);
      setPasswordError("Password requirements not met");
      return;
    }

    // finally check mismatch and mirror signup messaging for confirm
    if (newPassword !== confirmPassword) {
      setConfirmPasswordError(true);
      if (!confirmPassword.trim()) {
        setConfirmPasswordMessage("Please confirm your password");
      } else {
        setConfirmPasswordMessage("");
      }
      return;
    }

    try {
      setChangingPassword(true);

      // Check if user has new auth system
      const saltResponse = await fetch(
        apiUrl(
          `/api/auth/get-salt?username=${encodeURIComponent(user?.username || "")}`,
        ),
      );
      const saltData = await saltResponse.json();
      const hasNewAuth = saltData.hasNewAuth;

      let requestBody: any = {
        userId: user?.id,
        oldPassword,
        newPassword,
      };

      // For new auth users, derive keys and re-encrypt master key
      if (hasNewAuth && saltData.salt) {
        try {
          // Derive keys from old password to verify and decrypt master key
          const oldKeys = await deriveKeysFromPasswordWithSalt(
            oldPassword,
            saltData.salt,
          );

          // Fetch encrypted master key from server
          const userResponse = await fetch(
            apiUrl(`/api/auth/get-user?userId=${user?.id}`),
          );

          if (!userResponse.ok) {
            throw new Error("Failed to fetch user data");
          }

          const userData = await userResponse.json();

          if (!userData.encryptedMasterKey) {
            throw new Error("No encrypted master key found");
          }

          // Decrypt master key with old encryption key (will fail if wrong password)
          const masterKey = await decryptMasterKey(
            userData.encryptedMasterKey,
            oldKeys.encKey,
          );

          // Derive new keys from new password
          const newKeys = await deriveKeysFromPassword(newPassword);

          // Re-encrypt master key with new encryption key
          const newEncryptedMasterKey = await encryptMasterKey(
            masterKey,
            newKeys.encKey,
          );

          // Send new auth data to server
          requestBody = {
            userId: user?.id,
            oldPassword,
            newPassword,
            newAuthKey: newKeys.authKey,
            newSalt: newKeys.salt,
            newEncryptedMasterKey,
          };
        } catch (err: any) {
          // If decryption fails, current password is incorrect
          if (err.message?.includes("decrypt")) {
            throw new Error("Current password is incorrect");
          }
          throw err;
        }
      }

      const response = await fetch(apiUrl("/api/auth/change-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to change password");
      }

      setPasswordSuccess("Password changed successfully!");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      console.error("[Profile] Password change failed:", err);
      const msg = err.message || "Failed to change password";
      // Map decryption or old-password failures to inline current-password message
      if (
        msg.includes("Current password is incorrect") ||
        msg.includes("Decryption failed")
      ) {
        setCurrentPasswordMessage("Incorrect password. Try again.");
        setCurrentPasswordError(true);
        setPasswordError("");
      } else {
        setPasswordError("Failed to change password");
      }
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <AppLayout showHeader={false}>
        <div className="profile-loading-content">
          <div className="text-center">
            <div className="profile-spinner"></div>
            <p className="profile-loading-text">Loading profile...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout showHeader={false}>
      <div className="profile-container">
        <div className="profile-content">
          <div className="profile-inner">
            {/* Header */}
            <div className="profile-header">
              <div className="profile-header-content">
                <div className="profile-avatar">
                  <UserIcon className="profile-avatar-icon" />
                </div>
                <div>
                  <h1 className="profile-username">{user?.username}</h1>
                </div>
              </div>
            </div>

            {/* Change Password Section */}
            <div className="password-section">
              <div className="password-section-header">
                <Lock className="password-section-icon" />
                <h2 className="password-section-title">Change Password</h2>
              </div>

              {/* Top alert shown when not a current-password inline error */}
              {passwordError && !currentPasswordMessage && (
                <div className="alert-error">
                  <p className="alert-error-text">{passwordError}</p>
                </div>
              )}

              {passwordSuccess && (
                <div className="alert-success">
                  <p className="alert-success-text">{passwordSuccess}</p>
                </div>
              )}

              <form
                noValidate
                onSubmit={handlePasswordChange}
                className="password-form"
              >
                <div className="form-group">
                  <label className="form-label">Current Password</label>
                  <div className="input-wrapper">
                    <input
                      type={showOldPassword ? "text" : "password"}
                      value={oldPassword}
                      onChange={(e) => {
                        setOldPassword(e.target.value);
                        setPasswordError("");
                        setCurrentPasswordMessage("");
                        setCurrentPasswordError(false);
                      }}
                      className={`form-input ${currentPasswordError ? "border-red-500" : ""}`}
                      placeholder="Enter current password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowOldPassword(!showOldPassword)}
                      className="input-toggle-button"
                    >
                      {showOldPassword ? (
                        <EyeOff className="input-toggle-icon" />
                      ) : (
                        <Eye className="input-toggle-icon" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">New Password</label>
                  <div className="input-wrapper">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        setPasswordInvalidOnSubmit(false);
                        setPasswordError("");
                        setChangeAttempted(false);
                        setConfirmPasswordError(false);
                      }}
                      className="form-input"
                      placeholder="Enter new password"
                      required
                      minLength={8}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="input-toggle-button"
                    >
                      {showNewPassword ? (
                        <EyeOff className="input-toggle-icon" />
                      ) : (
                        <Eye className="input-toggle-icon" />
                      )}
                    </button>
                  </div>
                  {(() => {
                    const baseClass = "status-line";
                    const requirements = [
                      "lowercase letter",
                      "uppercase letter",
                      "number",
                      "special character",
                    ];
                    let unmet: string[] = [];
                    if (!passwordValidation.hasLowercase)
                      unmet.push("lowercase letter");
                    if (!passwordValidation.hasUppercase)
                      unmet.push("uppercase letter");
                    if (!passwordValidation.hasNumber) unmet.push("number");
                    if (!passwordValidation.hasSpecial)
                      unmet.push("special character");

                    if (isPasswordValid) {
                      const strength = (() => {
                        const validations = Object.values(passwordValidation);
                        const passed = validations.filter(Boolean).length;
                        if (passed === 5)
                          return { level: "Strong", color: "status-green" };
                        if (passed >= 3)
                          return { level: "Moderate", color: "status-yellow" };
                        return { level: "Weak", color: "status-red" };
                      })();
                      return (
                        <p className={`${baseClass} status-neutral`}>
                          Strength:{" "}
                          <span className={strength.color}>
                            {strength.level}
                          </span>
                        </p>
                      );
                    }
                    return (
                      <p className={`${baseClass} status-neutral`}>
                        Must contain:{" "}
                        {(unmet.length > 0 ? unmet : requirements).join(", ")}
                      </p>
                    );
                  })()}
                </div>

                <div className="form-group">
                  <label className="form-label">Confirm New Password</label>
                  <div className="input-wrapper">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setConfirmPasswordError(false);
                        setChangeAttempted(false);
                        setPasswordError("");
                        setConfirmPasswordMessage("");
                      }}
                      className={`form-input ${confirmPasswordError ? "border-red-500" : ""}`}
                      placeholder="Confirm new password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      className="input-toggle-button"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="input-toggle-icon" />
                      ) : (
                        <Eye className="input-toggle-icon" />
                      )}
                    </button>
                  </div>
                  {confirmPasswordMessage ? (
                    <p className="status-line status-red">
                      {confirmPasswordMessage}
                    </p>
                  ) : (
                    changeAttempted &&
                    confirmPassword.trim() !== "" &&
                    !passwordInvalidOnSubmit &&
                    newPassword !== confirmPassword && (
                      <p className="status-line status-red">
                        Passwords do not match
                      </p>
                    )
                  )}
                </div>

                {currentPasswordMessage && (
                  <p className="status-line status-red">
                    {currentPasswordMessage}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={changingPassword || !isPasswordValid}
                  className="submit-button"
                >
                  {changingPassword
                    ? "Changing Password..."
                    : "Change Password"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};
