# Multi-Factor Authentication Implementation

This document outlines the implementation of multi-factor authentication (MFA) in the Payroll Backend System.

## Overview

The system supports two types of MFA:

1. **App-based MFA**: Using Time-based One-Time Password (TOTP) authentication, which is compatible with authenticator apps like Google Authenticator, Microsoft Authenticator, and Authy. 

2. **Email-based MFA**: Using one-time codes sent to the user's email address.

Both implementations include appropriate security measures and verification processes. App-based MFA also includes backup codes for account recovery.

## Database Changes

The following changes have been made to the `users` table:

### App-based MFA Fields
- `mfa_enabled` (BOOLEAN): Indicates if app-based MFA is enabled for the user
- `mfa_secret` (VARCHAR): The secret key used for TOTP generation
- `mfa_backup_codes` (TEXT): JSON array of backup codes for account recovery

### Email-based MFA Fields
- `email_mfa_enabled` (BOOLEAN): Indicates if email-based MFA is enabled for the user
- `email_mfa_code` (VARCHAR): The current verification code sent to user's email
- `email_mfa_expires` (DATETIME): Expiration timestamp for the email verification code

## New Endpoints

### Public Endpoints

- `POST /api/auth/login`: Updated to check MFA status and return different responses based on whether MFA is enabled
- `POST /api/auth/verify-mfa`: Verify TOTP app-based MFA tokens or backup codes
- `POST /api/auth/verify-email-mfa-login`: Verify email-based MFA codes
- `POST /api/auth/send-mfa-code`: Send a new MFA code via email during login

### Protected Endpoints (Requires Authentication)

#### App-based MFA
- `POST /api/auth/setup-mfa`: Initiates app-based MFA setup by generating a secret and QR code
- `POST /api/auth/verify-setup-mfa`: Verifies a TOTP code during setup and enables app-based MFA
- `POST /api/auth/disable-mfa`: Disables app-based MFA for the user (requires password verification)
- `POST /api/auth/generate-backup-codes`: Generates new backup codes for app-based MFA

#### Email-based MFA
- `POST /api/auth/setup-email-mfa`: Initiates email-based MFA setup by sending a verification code
- `POST /api/auth/verify-email-mfa`: Verifies the email code during setup and enables email-based MFA
- `POST /api/auth/disable-email-mfa`: Disables email-based MFA for the user (requires password verification)

## Login Flow with MFA

1. User submits email/password
2. If MFA is not enabled:
   - User receives a normal JWT token and is logged in immediately
3. If app-based MFA is enabled:
   - User receives a temporary token and a flag indicating MFA is required with type "app"
   - User must then submit a valid TOTP code or backup code to complete login
   - Upon successful verification, user receives a full JWT token with MFA verified flag
4. If email-based MFA is enabled:
   - User receives a temporary token and a flag indicating MFA is required with type "email"
   - User requests a verification code to be sent to their email
   - After receiving the code via email, user submits it to complete login
   - Upon successful verification, user receives a full JWT token with MFA verified flag

## MFA Setup Process

### App-based MFA Setup
1. User requests app-based MFA setup
2. System generates a secret and QR code for the user to scan with an authenticator app
3. User scans the QR code and enters the first code generated
4. System verifies the code and enables app-based MFA if valid
5. System provides backup codes for the user to save securely

### Email-based MFA Setup
1. User requests email-based MFA setup
2. System generates a verification code and sends it to the user's email
3. User enters the verification code received in their email
4. System verifies the code and enables email-based MFA if valid

## Security Considerations

### App-based MFA
- MFA secrets are stored in the database but should ideally be encrypted at rest
- Backup codes are stored as a JSON array but should be hashed in a production environment
- The temporary token issued during MFA authentication has a short expiry time (10 minutes)
- The auth middleware verifies MFA status for all protected routes

### Email-based MFA
- Email verification codes expire after 10 minutes
- Codes are cleared from the database after successful verification
- Email verification codes are rate-limited to prevent brute-force attacks
- Password verification is required to disable email-based MFA

## Implementation Notes

### App-based MFA
- The TOTP MFA functionality uses the `speakeasy` library for code generation and verification
- QR codes are generated using the `qrcode` library
- Backup codes are generated as random alphanumeric strings

### Email-based MFA
- Email verification codes are 6-digit numeric codes
- Emails are sent using the `nodemailer` library
- The same email infrastructure used for sending paystubs is used for MFA codes

### Common
- The JWT token now includes an `isMfaVerified` flag to indicate MFA status
- The system supports having either app-based or email-based MFA enabled, or both
- All MFA verification endpoints are rate-limited to prevent brute-force attacks
