import sys
import os
import unittest
import json
import sqlite3
import hashlib
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))

from main import app
from database import (
    init_db,
    get_user_by_email,
    get_latest_otp_for_user,
    create_password_reset_otp,
    update_user_password,
    get_user_by_id
)

client = TestClient(app)

class TestAuthCompleteScenarios(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        init_db()

    def test_scenario_01_and_02_registration_no_autologin(self):
        """TEST 1 & 2: Registration does not auto-login and redirects to Sign In with message."""
        test_email = f"student_{datetime.now().timestamp()}@gmail.com"
        payload = {
            "name": "Jordan Hayes",
            "email": test_email,
            "password": "InitialPassword123!",
            "confirm_password": "InitialPassword123!"
        }
        res = client.post("/api/auth/register", json=payload)
        self.assertEqual(res.status_code, 201)
        data = res.json()

        # TEST 1: Registration creates account, does not auto-login
        self.assertTrue(data.get("success"))
        self.assertNotIn("token", data)
        self.assertNotIn("session", data)
        self.assertEqual(data.get("email"), test_email)

        # TEST 2: Success message instructing student to sign in
        self.assertEqual(
            data.get("message"),
            "Your account has been created successfully. Please sign in using your registered email and password."
        )

    def test_scenario_03_and_04_signin_valid_vs_invalid(self):
        """TEST 3 & 4: Sign in with valid credentials vs invalid credentials rejection."""
        # TEST 4: Try incorrect password -> must be rejected
        res_fail = client.post("/api/auth/login", json={
            "email": "demo@learnmind.ai",
            "password": "WrongPassword999"
        })
        self.assertEqual(res_fail.status_code, 401)
        self.assertEqual(res_fail.json().get("detail"), "Invalid email or password. Please try again.")

        # TEST 3: Sign in with correct password -> succeeds and loads student data
        res_ok = client.post("/api/auth/login", json={
            "email": "demo@learnmind.ai",
            "password": "password123"
        })
        self.assertEqual(res_ok.status_code, 200)
        data = res_ok.json()
        self.assertTrue(data.get("success"))
        self.assertIn("token", data)
        self.assertEqual(data["user"]["email"], "demo@learnmind.ai")
        self.assertIn("partition", data)

    def test_scenario_05_and_06_forgot_password_request_and_brevo(self):
        """TEST 5 & 6: Request verification code and confirm Brevo validation."""
        # Non-existent account rejected
        res_none = client.post("/api/auth/forgot-password", json={
            "email": "nonexistent_student_999@gmail.com"
        })
        self.assertEqual(res_none.status_code, 404)

        # Registered account: Brevo key configuration check
        # If Brevo key is not yet configured by user, endpoint securely alerts developer
        res_req = client.post("/api/auth/forgot-password", json={
            "email": "demo@learnmind.ai"
        })
        # If Brevo API key is not configured, returns 502 with clear Brevo key instructions
        # If Brevo API key is configured, returns 200
        self.assertIn(res_req.status_code, [200, 502])
        if res_req.status_code == 502:
            self.assertIn("BREVO_API_KEY", res_req.json().get("detail"))

    def test_scenario_07_08_09_10_11_12_otp_lifecycle_and_reset(self):
        """TEST 7-12: Incorrect OTP, expired OTP, valid OTP, reset password, no auto-login, old pw rejected, new pw accepted."""
        # 1. Create a fresh student for recovery test
        email = f"recovery_{datetime.now().timestamp()}@gmail.com"
        client.post("/api/auth/register", json={
            "name": "Sarah Connor",
            "email": email,
            "password": "OriginalPassword123",
            "confirm_password": "OriginalPassword123"
        })
        user = get_user_by_email(email)
        self.assertIsNotNone(user)

        # 2. Setup an expired OTP
        expired_otp = "111222"
        expired_hash = hashlib.sha256(expired_otp.encode()).hexdigest()
        past_time = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        create_password_reset_otp(user["id"], expired_hash, past_time)

        # TEST 8: Enter expired OTP -> rejected
        res_exp = client.post("/api/auth/verify-reset-otp", json={
            "email": email,
            "otp": expired_otp
        })
        self.assertEqual(res_exp.status_code, 400)
        self.assertIn("expired", res_exp.json().get("detail").lower())

        # 3. Setup a valid 5-minute OTP
        valid_otp = "749281"
        valid_hash = hashlib.sha256(valid_otp.encode()).hexdigest()
        future_time = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
        create_password_reset_otp(user["id"], valid_hash, future_time)

        # TEST 7: Enter incorrect OTP -> rejected
        res_wrong = client.post("/api/auth/verify-reset-otp", json={
            "email": email,
            "otp": "999999"
        })
        self.assertEqual(res_wrong.status_code, 400)
        self.assertIn("Invalid verification code", res_wrong.json().get("detail"))

        # TEST 9: Enter valid OTP -> accepts code and returns single-use reset_token
        res_valid = client.post("/api/auth/verify-reset-otp", json={
            "email": email,
            "otp": valid_otp
        })
        self.assertEqual(res_valid.status_code, 200)
        reset_token = res_valid.json().get("reset_token")
        self.assertIsNotNone(reset_token)

        # TEST 9 & 10: Reset password using reset_token. Confirm NOT automatically logged in
        res_reset = client.post("/api/auth/reset-password", json={
            "email": email,
            "reset_token": reset_token,
            "new_password": "NewBrandPassword456!",
            "confirm_password": "NewBrandPassword456!"
        })
        self.assertEqual(res_reset.status_code, 200)
        self.assertEqual(
            res_reset.json().get("message"),
            "Your password has been reset successfully. Please sign in using your new password."
        )
        self.assertNotIn("token", res_reset.json())

        # TEST 11: Old password no longer works
        res_old = client.post("/api/auth/login", json={
            "email": email,
            "password": "OriginalPassword123"
        })
        self.assertEqual(res_old.status_code, 401)
        self.assertEqual(res_old.json().get("detail"), "Invalid email or password. Please try again.")

        # TEST 12: New password works successfully
        res_new = client.post("/api/auth/login", json={
            "email": email,
            "password": "NewBrandPassword456!"
        })
        self.assertEqual(res_new.status_code, 200)
        self.assertTrue(res_new.json().get("success"))
        self.assertIn("token", res_new.json())

    def test_scenario_13_student_isolation_in_recovery(self):
        """TEST 13: Password recovery for Student A cannot affect or reset Student B's account."""
        email_a = f"studentA_{datetime.now().timestamp()}@gmail.com"
        email_b = f"studentB_{datetime.now().timestamp()}@gmail.com"

        client.post("/api/auth/register", json={
            "name": "Student A",
            "email": email_a,
            "password": "PasswordA123",
            "confirm_password": "PasswordA123"
        })
        client.post("/api/auth/register", json={
            "name": "Student B",
            "email": email_b,
            "password": "PasswordB123",
            "confirm_password": "PasswordB123"
        })

        user_a = get_user_by_email(email_a)
        user_b = get_user_by_email(email_b)

        # Issue reset token for Student A
        otp_a = "654321"
        create_password_reset_otp(user_a["id"], hashlib.sha256(otp_a.encode()).hexdigest(), (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat())
        res_a = client.post("/api/auth/verify-reset-otp", json={"email": email_a, "otp": otp_a})
        token_a = res_a.json().get("reset_token")

        # Attempt to use Student A's reset token to reset Student B's password -> must fail!
        res_hack = client.post("/api/auth/reset-password", json={
            "email": email_b,
            "reset_token": token_a,
            "new_password": "HackedPassword999",
            "confirm_password": "HackedPassword999"
        })
        self.assertEqual(res_hack.status_code, 400)

        # Verify Student B's original password remains intact and working
        res_b_login = client.post("/api/auth/login", json={"email": email_b, "password": "PasswordB123"})
        self.assertEqual(res_b_login.status_code, 200)

if __name__ == "__main__":
    unittest.main()
