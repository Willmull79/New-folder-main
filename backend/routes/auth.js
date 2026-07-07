const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateRequest, schemas } = require('../middleware/validation');
const { generateToken, authenticateToken, hashPassword, comparePassword } = require('../middleware/auth');
const User = require('../models/User');
const { AppError } = require('../middleware/errorHandler');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const router = express.Router();

// Email transporter setup
const createTransporter = () => {
    return nodemailer.createTransporter({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
};

// Send verification email
const sendVerificationEmail = async (user, token) => {
    const transporter = createTransporter();
    
    const mailOptions = {
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
        `
    };

    await transporter.sendMail(mailOptions);
};

// Send password reset email
const sendPasswordResetEmail = async (user, token) => {
    const transporter = createTransporter();
    
    const mailOptions = {
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
        `
    };

    await transporter.sendMail(mailOptions);
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', 
    validateRequest(schemas.user.register),
    asyncHandler(async (req, res) => {
        const { email, password, firstName, lastName, username } = req.body;

        // Check if user already exists
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            throw new AppError('User with this email already exists', 400);
        }

        // Check if username is taken (if provided)
        if (username) {
            const existingUsername = await User.findByUsername(username);
            if (existingUsername) {
                throw new AppError('Username is already taken', 400);
            }
        }

        // Create verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // Create user
        const user = new User({
            email,
            password,
            firstName,
            lastName,
            username,
            verificationToken
        });

        await user.save();

        // Send verification email
        try {
            await sendVerificationEmail(user, verificationToken);
        } catch (error) {
            console.error('Failed to send verification email:', error);
            // Don't fail registration if email fails
        }

        // Generate token
        const token = generateToken(user._id);

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        res.status(201).json({
            success: true,
            message: 'User registered successfully. Please check your email to verify your account.',
            data: {
                user: user.getPublicProfile(),
                token
            }
        });
    })
);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login',
    validateRequest(schemas.user.login),
    asyncHandler(async (req, res) => {
        const { email, password } = req.body;

        // Find user and include password for comparison
        const user = await User.findByEmail(email).select('+password');
        if (!user) {
            throw new AppError('Invalid email or password', 401);
        }

        // Check if account is active
        if (!user.isActive) {
            throw new AppError('Account has been deactivated', 403);
        }

        // Check password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            throw new AppError('Invalid email or password', 401);
        }

        // Generate token
        const token = generateToken(user._id);

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                user: user.getPublicProfile(),
                token
            }
        });
    })
);

// @route   POST /api/auth/verify-email
// @desc    Verify email address
// @access  Public
router.post('/verify-email',
    asyncHandler(async (req, res) => {
        const { token } = req.body;

        if (!token) {
            throw new AppError('Verification token is required', 400);
        }

        const user = await User.findOne({ verificationToken: token });
        if (!user) {
            throw new AppError('Invalid verification token', 400);
        }

        user.isVerified = true;
        user.verificationToken = null;
        await user.save();

        res.json({
            success: true,
            message: 'Email verified successfully'
        });
    })
);

// @route   POST /api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post('/forgot-password',
    asyncHandler(async (req, res) => {
        const { email } = req.body;

        if (!email) {
            throw new AppError('Email is required', 400);
        }

        const user = await User.findByEmail(email);
        if (!user) {
            // Don't reveal if email exists or not
            return res.json({
                success: true,
                message: 'If an account with that email exists, a password reset link has been sent.'
            });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetPasswordToken = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');

        user.resetPasswordToken = resetPasswordToken;
        user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
        await user.save();

        // Send reset email
        try {
            await sendPasswordResetEmail(user, resetToken);
        } catch (error) {
            console.error('Failed to send password reset email:', error);
            throw new AppError('Failed to send password reset email', 500);
        }

        res.json({
            success: true,
            message: 'If an account with that email exists, a password reset link has been sent.'
        });
    })
);

// @route   POST /api/auth/reset-password
// @desc    Reset password with token
// @access  Public
router.post('/reset-password',
    asyncHandler(async (req, res) => {
        const { token, password } = req.body;

        if (!token || !password) {
            throw new AppError('Token and new password are required', 400);
        }

        // Hash the token
        const resetPasswordToken = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            throw new AppError('Invalid or expired reset token', 400);
        }

        // Update password
        user.password = password;
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await user.save();

        res.json({
            success: true,
            message: 'Password reset successfully'
        });
    })
);

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me',
    authenticateToken,
    asyncHandler(async (req, res) => {
        res.json({
            success: true,
            data: {
                user: req.user.getPublicProfile()
            }
        });
    })
);

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile',
    authenticateToken,
    validateRequest(schemas.user.update),
    asyncHandler(async (req, res) => {
        const { firstName, lastName, username, avatar, preferences } = req.body;

        // Check if username is taken (if changing)
        if (username && username !== req.user.username) {
            const existingUsername = await User.findByUsername(username);
            if (existingUsername) {
                throw new AppError('Username is already taken', 400);
            }
        }

        // Update user
        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            {
                firstName,
                lastName,
                username,
                avatar,
                preferences
            },
            { new: true, runValidators: true }
        );

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                user: updatedUser.getPublicProfile()
            }
        });
    })
);

// @route   PUT /api/auth/change-password
// @desc    Change user password
// @access  Private
router.put('/change-password',
    authenticateToken,
    asyncHandler(async (req, res) => {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            throw new AppError('Current password and new password are required', 400);
        }

        // Get user with password
        const user = await User.findById(req.user._id).select('+password');

        // Verify current password
        const isPasswordValid = await user.comparePassword(currentPassword);
        if (!isPasswordValid) {
            throw new AppError('Current password is incorrect', 400);
        }

        // Update password
        user.password = newPassword;
        await user.save();

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    })
);

// @route   POST /api/auth/logout
// @desc    Logout user (client-side token removal)
// @access  Private
router.post('/logout',
    authenticateToken,
    asyncHandler(async (req, res) => {
        // In a stateless JWT system, logout is handled client-side
        // You could implement a blacklist here if needed
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    })
);

// @route   DELETE /api/auth/account
// @desc    Delete user account
// @access  Private
router.delete('/account',
    authenticateToken,
    asyncHandler(async (req, res) => {
        const { password } = req.body;

        if (!password) {
            throw new AppError('Password is required to delete account', 400);
        }

        // Get user with password
        const user = await User.findById(req.user._id).select('+password');

        // Verify password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            throw new AppError('Password is incorrect', 400);
        }

        // Deactivate account instead of deleting
        user.isActive = false;
        await user.save();

        res.json({
            success: true,
            message: 'Account deactivated successfully'
        });
    })
);

// @route   POST /api/auth/resend-verification
// @desc    Resend verification email
// @access  Private
router.post('/resend-verification',
    authenticateToken,
    asyncHandler(async (req, res) => {
        if (req.user.isVerified) {
            throw new AppError('Email is already verified', 400);
        }

        // Generate new verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        req.user.verificationToken = verificationToken;
        await req.user.save();

        // Send verification email
        try {
            await sendVerificationEmail(req.user, verificationToken);
        } catch (error) {
            console.error('Failed to send verification email:', error);
            throw new AppError('Failed to send verification email', 500);
        }

        res.json({
            success: true,
            message: 'Verification email sent successfully'
        });
    })
);

module.exports = router; 