const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateRequest, schemas } = require('../middleware/validation');
const { generateToken, authenticateToken } = require('../middleware/auth');
const userService = require('../services/userService');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();

const createTransporter = () => nodemailer.createTransporter({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

const sendVerificationEmail = async (user, token) => {
    const transporter = createTransporter();

    await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: user.email,
        subject: 'Verify Your Email - Fantasy Dynasty Central',
        html: `
            <h2>Welcome to Fantasy Dynasty Central!</h2>
            <p>Please click the link below to verify your email address:</p>
            <a href="${process.env.FRONTEND_URL}/verify-email?token=${token}">
                Verify Email Address
            </a>
            <p>If you didn't create an account, you can safely ignore this email.</p>
        `,
    });
};

const sendPasswordResetEmail = async (user, token) => {
    const transporter = createTransporter();

    await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: user.email,
        subject: 'Password Reset - Fantasy Dynasty Central',
        html: `
            <h2>Password Reset Request</h2>
            <p>You requested a password reset. Click the link below to reset your password:</p>
            <a href="${process.env.FRONTEND_URL}/reset-password?token=${token}">
                Reset Password
            </a>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request a password reset, you can safely ignore this email.</p>
        `,
    });
};

router.post('/register',
    validateRequest(schemas.user.register),
    asyncHandler(async (req, res) => {
        const { email, password, firstName, lastName, username } = req.body;

        const existingUser = await userService.findByEmail(email);
        if (existingUser) {
            throw new AppError('User with this email already exists', 400);
        }

        if (username) {
            const existingUsername = await userService.findByUsername(username);
            if (existingUsername) {
                throw new AppError('Username is already taken', 400);
            }
        }

        const verificationToken = crypto.randomBytes(32).toString('hex');
        const user = await userService.createUser({
            email,
            password,
            firstName,
            lastName,
            username,
            verificationToken,
        });

        try {
            await sendVerificationEmail(user, verificationToken);
        } catch (error) {
            console.error('Failed to send verification email:', error);
        }

        const token = generateToken(user._id);
        await userService.updateUser(user._id, { lastLogin: new Date() });
        const updatedUser = await userService.findById(user._id);

        res.status(201).json({
            success: true,
            message: 'User registered successfully. Please check your email to verify your account.',
            data: {
                user: updatedUser.getPublicProfile(),
                token,
            },
        });
    }));

router.post('/login',
    validateRequest(schemas.user.login),
    asyncHandler(async (req, res) => {
        const { email, password } = req.body;

        const user = await userService.findByEmail(email, true);
        if (!user) {
            throw new AppError('Invalid email or password', 401);
        }

        if (!user.isActive) {
            throw new AppError('Account has been deactivated', 403);
        }

        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            throw new AppError('Invalid email or password', 401);
        }

        const token = generateToken(user._id);
        await userService.updateUser(user._id, { lastLogin: new Date() });
        const updatedUser = await userService.findById(user._id);

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                user: updatedUser.getPublicProfile(),
                token,
            },
        });
    }));

router.post('/verify-email',
    asyncHandler(async (req, res) => {
        const { token } = req.body;

        if (!token) {
            throw new AppError('Verification token is required', 400);
        }

        const user = await userService.findByVerificationToken(token);
        if (!user) {
            throw new AppError('Invalid verification token', 400);
        }

        await userService.updateUser(user._id, {
            isVerified: true,
            verificationToken: null,
        });

        res.json({
            success: true,
            message: 'Email verified successfully',
        });
    }));

router.post('/forgot-password',
    asyncHandler(async (req, res) => {
        const { email } = req.body;

        if (!email) {
            throw new AppError('Email is required', 400);
        }

        const user = await userService.findByEmail(email);
        if (!user) {
            return res.json({
                success: true,
                message: 'If an account with that email exists, a password reset link has been sent.',
            });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetPasswordToken = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');

        await userService.updateUser(user._id, {
            resetPasswordToken,
            resetPasswordExpires: new Date(Date.now() + 60 * 60 * 1000),
        });

        try {
            await sendPasswordResetEmail(user, resetToken);
        } catch (error) {
            console.error('Failed to send password reset email:', error);
            throw new AppError('Failed to send password reset email', 500);
        }

        res.json({
            success: true,
            message: 'If an account with that email exists, a password reset link has been sent.',
        });
    }));

router.post('/reset-password',
    asyncHandler(async (req, res) => {
        const { token, password } = req.body;

        if (!token || !password) {
            throw new AppError('Token and new password are required', 400);
        }

        const resetPasswordToken = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        const user = await userService.findByResetToken(resetPasswordToken);
        if (!user) {
            throw new AppError('Invalid or expired reset token', 400);
        }

        await userService.updateUser(user._id, {
            password,
            resetPasswordToken: null,
            resetPasswordExpires: null,
        });

        res.json({
            success: true,
            message: 'Password reset successfully',
        });
    }));

router.get('/me',
    authenticateToken,
    asyncHandler(async (req, res) => {
        res.json({
            success: true,
            data: {
                user: req.user.getPublicProfile(),
            },
        });
    }));

router.put('/profile',
    authenticateToken,
    validateRequest(schemas.user.update),
    asyncHandler(async (req, res) => {
        const { firstName, lastName, username, avatar, preferences } = req.body;

        if (username && username !== req.user.username) {
            const existingUsername = await userService.findByUsername(username);
            if (existingUsername) {
                throw new AppError('Username is already taken', 400);
            }
        }

        const updatedUser = await userService.updateUser(req.user._id, {
            firstName,
            lastName,
            username,
            avatar,
            preferences,
        });

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                user: updatedUser.getPublicProfile(),
            },
        });
    }));

router.put('/change-password',
    authenticateToken,
    asyncHandler(async (req, res) => {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            throw new AppError('Current password and new password are required', 400);
        }

        const user = await userService.findById(req.user._id, true);
        const isPasswordValid = await user.comparePassword(currentPassword);
        if (!isPasswordValid) {
            throw new AppError('Current password is incorrect', 400);
        }

        await userService.updateUser(user._id, { password: newPassword });

        res.json({
            success: true,
            message: 'Password changed successfully',
        });
    }));

router.post('/logout',
    authenticateToken,
    asyncHandler(async (req, res) => {
        res.json({
            success: true,
            message: 'Logged out successfully',
        });
    }));

router.delete('/account',
    authenticateToken,
    asyncHandler(async (req, res) => {
        const { password } = req.body;

        if (!password) {
            throw new AppError('Password is required to delete account', 400);
        }

        const user = await userService.findById(req.user._id, true);
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            throw new AppError('Password is incorrect', 400);
        }

        await userService.updateUser(user._id, { isActive: false });

        res.json({
            success: true,
            message: 'Account deactivated successfully',
        });
    }));

router.post('/resend-verification',
    authenticateToken,
    asyncHandler(async (req, res) => {
        if (req.user.isVerified) {
            throw new AppError('Email is already verified', 400);
        }

        const verificationToken = crypto.randomBytes(32).toString('hex');
        await userService.updateUser(req.user._id, { verificationToken });

        try {
            await sendVerificationEmail(req.user, verificationToken);
        } catch (error) {
            console.error('Failed to send verification email:', error);
            throw new AppError('Failed to send verification email', 500);
        }

        res.json({
            success: true,
            message: 'Verification email sent successfully',
        });
    }));

module.exports = router;
