// HalaChat - Swagger/OpenAPI Configuration
// إعداد توثيق API باستخدام Swagger

const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const BASE_URL = process.env.BASE_URL || 'https://halachat.khalafiati.io';

const swaggerDefinition = {
    openapi: '3.0.0',
    info: {
        title: 'HalaChat API Documentation',
        version: '2.1.0',
        description: 'API documentation for HalaChat Dashboard & Mobile Application. Includes admin dashboard endpoints and mobile client endpoints.',
        contact: {
            name: 'HalaChat Support',
            url: BASE_URL
        }
    },
    servers: [
        {
            url: BASE_URL,
            description: 'Production Server'
        },
        {
            url: 'http://localhost:5000',
            description: 'Development Server'
        }
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                description: 'Enter JWT token obtained from login/register endpoints'
            }
        },
        schemas: {
            // ========================
            // Common Schemas
            // ========================
            Error: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: 'Error message' }
                }
            },
            Pagination: {
                type: 'object',
                properties: {
                    currentPage: { type: 'integer', example: 1 },
                    totalPages: { type: 'integer', example: 5 },
                    total: { type: 'integer', example: 100 }
                }
            },

            // ========================
            // User Schemas
            // ========================
            User: {
                type: 'object',
                properties: {
                    _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
                    name: { type: 'string', example: 'Ahmed' },
                    email: { type: 'string', format: 'email', example: 'ahmed@example.com' },
                    role: { type: 'string', enum: ['user', 'admin'], example: 'user' },
                    profileImage: { type: 'string', nullable: true, example: '/uploads/profile-images/img.jpg' },
                    isActive: { type: 'boolean', example: true },
                    isOnline: { type: 'boolean', example: false },
                    gender: { type: 'string', enum: ['male', 'female'], nullable: true },
                    country: { type: 'string', nullable: true, example: 'SA' },
                    bio: { type: 'string', nullable: true },
                    birthDate: { type: 'string', format: 'date', nullable: true },
                    isPremium: { type: 'boolean', example: false },
                    lastLogin: { type: 'string', format: 'date-time' },
                    authProvider: { type: 'string', enum: ['app', 'google', 'apple'], example: 'app' }
                }
            },
            AuthResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string' },
                    data: {
                        type: 'object',
                        properties: {
                            user: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string' },
                                    name: { type: 'string' },
                                    email: { type: 'string' },
                                    role: { type: 'string' },
                                    profileImage: { type: 'string', nullable: true },
                                    lastLogin: { type: 'string', format: 'date-time' }
                                }
                            },
                            token: { type: 'string', description: 'JWT access token' },
                            refreshToken: { type: 'string', description: 'JWT refresh token' }
                        }
                    }
                }
            },

            // ========================
            // ChatRoom Schemas
            // ========================
            ChatRoom: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    name: { type: 'string', example: 'General Chat' },
                    image: { type: 'string' },
                    description: { type: 'string' },
                    accessType: { type: 'string', enum: ['public', 'private'], example: 'public' },
                    isActive: { type: 'boolean', example: true },
                    isLocked: { type: 'boolean', example: false },
                    memberCount: { type: 'integer', example: 50 },
                    messageCount: { type: 'integer', example: 1200 },
                    category: { type: 'string', nullable: true },
                    settings: { type: 'object' },
                    pinnedMessage: {
                        type: 'object',
                        nullable: true,
                        properties: {
                            content: { type: 'string' },
                            createdAt: { type: 'string', format: 'date-time' },
                            createdBy: { type: 'string' }
                        }
                    },
                    lastMessage: {
                        type: 'object',
                        nullable: true,
                        properties: {
                            content: { type: 'string' },
                            sender: { type: 'string' },
                            sentAt: { type: 'string', format: 'date-time' }
                        }
                    },
                    createdBy: { type: 'string' },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' }
                }
            },

            // ========================
            // Message Schemas
            // ========================
            Message: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    chatType: { type: 'string', enum: ['conversation', 'room'] },
                    conversation: { type: 'string', nullable: true },
                    room: { type: 'string', nullable: true },
                    sender: {
                        type: 'object',
                        properties: {
                            _id: { type: 'string' },
                            name: { type: 'string' },
                            email: { type: 'string' },
                            profileImage: { type: 'string', nullable: true }
                        }
                    },
                    content: { type: 'string' },
                    type: { type: 'string', enum: ['text', 'image', 'audio', 'video', 'file'], example: 'text' },
                    mediaUrl: { type: 'string', nullable: true },
                    status: { type: 'string', enum: ['sent', 'delivered', 'read'] },
                    isDeleted: { type: 'boolean', example: false },
                    hasBannedWords: { type: 'boolean', example: false },
                    createdAt: { type: 'string', format: 'date-time' }
                }
            },

            // ========================
            // Conversation Schemas
            // ========================
            Conversation: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    type: { type: 'string', enum: ['private', 'group'] },
                    participants: {
                        type: 'array',
                        items: { type: 'string' }
                    },
                    creator: { type: 'string' },
                    status: { type: 'string', enum: ['pending', 'accepted', 'rejected'] },
                    isActive: { type: 'boolean' },
                    title: { type: 'string' },
                    lastMessage: { type: 'string', nullable: true },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' }
                }
            },

            // ========================
            // Notification Schemas
            // ========================
            Notification: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    title: { type: 'string' },
                    body: { type: 'string' },
                    type: { type: 'string', enum: ['general', 'report', 'super_like', 'conversation_request'] },
                    recipients: { type: 'string', enum: ['all', 'specific'] },
                    targetUsers: { type: 'array', items: { type: 'string' } },
                    sender: { type: 'string' },
                    status: { type: 'string', enum: ['pending', 'sent', 'failed'] },
                    priority: { type: 'string', enum: ['low', 'normal', 'high'] },
                    sentCount: { type: 'integer' },
                    failedCount: { type: 'integer' },
                    createdAt: { type: 'string', format: 'date-time' }
                }
            },

            // ========================
            // BannedWord Schemas
            // ========================
            BannedWord: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    word: { type: 'string' },
                    type: { type: 'string', enum: ['word', 'username', 'both'], example: 'both' },
                    severity: { type: 'string', enum: ['low', 'medium', 'high'], example: 'medium' },
                    action: { type: 'string', enum: ['filter', 'block', 'warn'], example: 'filter' },
                    isActive: { type: 'boolean', example: true },
                    usageCount: { type: 'integer', example: 0 },
                    addedBy: { type: 'string' },
                    createdAt: { type: 'string', format: 'date-time' }
                }
            },

            // ========================
            // ActivityLog Schemas
            // ========================
            ActivityLog: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    user: { type: 'string' },
                    action: { type: 'string' },
                    description: { type: 'string' },
                    targetType: { type: 'string' },
                    targetId: { type: 'string' },
                    targetName: { type: 'string' },
                    severity: { type: 'string', enum: ['low', 'medium', 'high'] },
                    status: { type: 'string', enum: ['success', 'failure'] },
                    requestInfo: {
                        type: 'object',
                        properties: {
                            ipAddress: { type: 'string' },
                            userAgent: { type: 'string' },
                            method: { type: 'string' },
                            url: { type: 'string' }
                        }
                    },
                    createdAt: { type: 'string', format: 'date-time' }
                }
            },

            // ========================
            // Report Schemas
            // ========================
            Report: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    type: { type: 'string', enum: ['user', 'room'] },
                    reportedBy: { type: 'string' },
                    reportedUser: { type: 'string' },
                    category: { type: 'string', enum: ['spam', 'inappropriate', 'harassment', 'fake_profile', 'other'] },
                    description: { type: 'string' },
                    status: { type: 'string', enum: ['pending', 'reviewed', 'resolved'] },
                    priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                    createdAt: { type: 'string', format: 'date-time' }
                }
            },

            // ========================
            // Settings Schema
            // ========================
            Settings: {
                type: 'object',
                properties: {
                    appName: { type: 'string', example: 'HalaChat' },
                    appVersion: { type: 'string', example: '2.1' },
                    appLogo: { type: 'string' },
                    privacyPolicy: { type: 'string' },
                    termsOfService: { type: 'string' },
                    aboutApp: { type: 'string' },
                    contactEmail: { type: 'string' },
                    contactPhone: { type: 'string' },
                    websiteUrl: { type: 'string' },
                    socialMedia: { type: 'object' },
                    notificationsEnabled: { type: 'boolean' },
                    emailNotifications: { type: 'boolean' },
                    maxConversationParticipants: { type: 'integer' },
                    maxMessageLength: { type: 'integer' },
                    allowFileUploads: { type: 'boolean' },
                    maxFileSize: { type: 'integer' },
                    lastUpdated: { type: 'string', format: 'date-time' }
                }
            }
        }
    },
    tags: [
        { name: 'Health', description: 'Server health and status' },
        { name: 'Auth', description: 'Authentication - Register, Login, Password management' },
        { name: 'ChatRooms', description: 'Admin - Chat room management' },
        { name: 'Messages', description: 'Admin - Message management' },
        { name: 'Notifications', description: 'Admin - Push notifications management' },
        { name: 'Settings', description: 'App settings and content pages' },
        { name: 'BannedWords', description: 'Admin - Banned words management' },
        { name: 'ActivityLogs', description: 'Admin - Activity logs and audit trail' },
        { name: 'Mobile - Users', description: 'Mobile - User search, location, and discovery' },
        { name: 'Mobile - Profile', description: 'Mobile - Profile views, verification, stealth mode, privacy' },
        { name: 'Mobile - Premium', description: 'Mobile - Super Like and subscription management' },
        { name: 'Mobile - Blocking', description: 'Mobile - User blocking system' },
        { name: 'Mobile - Conversations', description: 'Mobile - Conversation requests, accept/reject, mute' },
        { name: 'Mobile - Messages', description: 'Mobile - Send and retrieve messages' },
        { name: 'Mobile - Reports', description: 'Mobile - Report users and content' },
        { name: 'Mobile - Notifications', description: 'Mobile - Notifications and device token management' },
        { name: 'Mobile - Rooms', description: 'Mobile - Public chat rooms and categories' }
    ],
    paths: {
        // ============================================================
        //  HEALTH
        // ============================================================
        '/': {
            get: {
                tags: ['Health'],
                summary: 'API root',
                description: 'Returns basic API information and status',
                responses: {
                    200: {
                        description: 'API info',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        message: { type: 'string' },
                                        status: { type: 'string' },
                                        version: { type: 'string' },
                                        apiVersions: { type: 'array', items: { type: 'string' } }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        '/api/health': {
            get: {
                tags: ['Health'],
                summary: 'Health check',
                description: 'Returns server and database connection status',
                responses: {
                    200: {
                        description: 'Server healthy',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        status: { type: 'string', example: 'success' },
                                        message: { type: 'string' },
                                        database: { type: 'string', example: 'connected' },
                                        uptime: { type: 'string', example: '3600s' }
                                    }
                                }
                            }
                        }
                    },
                    503: { description: 'Database connection issue' }
                }
            }
        },

        // ============================================================
        //  AUTH
        // ============================================================
        '/api/v1/auth/register': {
            post: {
                tags: ['Auth'],
                summary: 'Register a new user',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['name', 'email', 'password'],
                                properties: {
                                    name: { type: 'string', example: 'Ahmed Ali' },
                                    email: { type: 'string', format: 'email', example: 'ahmed@example.com' },
                                    password: { type: 'string', minLength: 6, example: 'password123' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    201: { description: 'User registered successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
                    400: { description: 'Validation error or email already exists' },
                    500: { description: 'Server error' }
                }
            }
        },
        '/api/v1/auth/login': {
            post: {
                tags: ['Auth'],
                summary: 'Login with email and password',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['email', 'password'],
                                properties: {
                                    email: { type: 'string', format: 'email' },
                                    password: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Login successful', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
                    401: { description: 'Invalid credentials' },
                    423: { description: 'Account temporarily locked' }
                }
            }
        },
        '/api/v1/auth/me': {
            get: {
                tags: ['Auth'],
                summary: 'Get current user profile',
                security: [{ bearerAuth: [] }],
                responses: {
                    200: { description: 'Current user data', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } } } } } } },
                    401: { description: 'Unauthorized' }
                }
            }
        },
        '/api/v1/auth/update-profile': {
            put: {
                tags: ['Auth'],
                summary: 'Update user profile',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' },
                                    email: { type: 'string', format: 'email' },
                                    profileImage: { type: 'string' },
                                    birthDate: { type: 'string', format: 'date' },
                                    gender: { type: 'string', enum: ['male', 'female'] },
                                    country: { type: 'string', example: 'SA' },
                                    bio: { type: 'string' },
                                    defaultAvatar: { type: 'string', example: 'avatar_1', description: 'avatar_1 to avatar_13' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Profile updated' },
                    400: { description: 'Email already in use' },
                    404: { description: 'User not found' }
                }
            }
        },
        '/api/v1/auth/change-password': {
            put: {
                tags: ['Auth'],
                summary: 'Change password',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['currentPassword', 'newPassword'],
                                properties: {
                                    currentPassword: { type: 'string' },
                                    newPassword: { type: 'string', minLength: 6 }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Password changed' },
                    400: { description: 'Current password incorrect or new password too short' }
                }
            }
        },
        '/api/v1/auth/forgot-password': {
            post: {
                tags: ['Auth'],
                summary: 'Request password reset code via email',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['email'],
                                properties: {
                                    email: { type: 'string', format: 'email' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Reset code sent to email' },
                    404: { description: 'User not found' }
                }
            }
        },
        '/api/v1/auth/reset-password': {
            post: {
                tags: ['Auth'],
                summary: 'Reset password using verification code',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['email', 'resetToken', 'newPassword'],
                                properties: {
                                    email: { type: 'string', format: 'email' },
                                    resetToken: { type: 'string', description: '6-digit code from email' },
                                    newPassword: { type: 'string', minLength: 6 }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Password reset successful' },
                    400: { description: 'Invalid or expired reset code' }
                }
            }
        },
        '/api/v1/auth/upload-profile-image': {
            put: {
                tags: ['Auth'],
                summary: 'Upload profile image',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'multipart/form-data': {
                            schema: {
                                type: 'object',
                                properties: {
                                    profileImage: { type: 'string', format: 'binary' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Image uploaded successfully' },
                    400: { description: 'No image uploaded' }
                }
            }
        },
        '/api/v1/auth/delete-account': {
            delete: {
                tags: ['Auth'],
                summary: 'Delete user account',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    password: { type: 'string', description: 'Required for app-registered users' },
                                    confirmDelete: { type: 'boolean', description: 'Required for Google/Apple users' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Account deleted' },
                    400: { description: 'Missing confirmation' },
                    401: { description: 'Incorrect password' }
                }
            }
        },
        '/api/v1/auth/google': {
            post: {
                tags: ['Auth'],
                summary: 'Login/Register with Google',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['idToken'],
                                properties: {
                                    idToken: { type: 'string', description: 'Google ID Token' },
                                    deviceToken: { type: 'string' },
                                    deviceInfo: { type: 'object' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Login/register successful', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
                    401: { description: 'Invalid Google token' }
                }
            }
        },
        '/api/v1/auth/apple': {
            post: {
                tags: ['Auth'],
                summary: 'Login/Register with Apple',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['identityToken'],
                                properties: {
                                    identityToken: { type: 'string', description: 'Apple Identity Token' },
                                    authorizationCode: { type: 'string' },
                                    fullName: { type: 'object', properties: { givenName: { type: 'string' }, familyName: { type: 'string' } } },
                                    email: { type: 'string' },
                                    deviceToken: { type: 'string' },
                                    deviceInfo: { type: 'object' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Login/register successful' },
                    401: { description: 'Invalid Apple token' }
                }
            }
        },
        '/api/v1/auth/device-token': {
            put: {
                tags: ['Auth'],
                summary: 'Update device token for push notifications',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['deviceToken'],
                                properties: {
                                    deviceToken: { type: 'string' },
                                    deviceInfo: { type: 'object' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Device token updated' },
                    400: { description: 'Device token required' }
                }
            }
        },
        '/api/v1/auth/refresh-token': {
            post: {
                tags: ['Auth'],
                summary: 'Refresh access token',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['refreshToken'],
                                properties: {
                                    refreshToken: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'New access token issued' },
                    401: { description: 'Invalid or expired refresh token' }
                }
            }
        },

        // ============================================================
        //  CHAT ROOMS (Admin)
        // ============================================================
        '/api/v1/chat-rooms': {
            get: {
                tags: ['ChatRooms'],
                summary: 'List all chat rooms (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
                    { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by name or description' },
                    { name: 'accessType', in: 'query', schema: { type: 'string', enum: ['public', 'private'] } },
                    { name: 'isActive', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } }
                ],
                responses: {
                    200: { description: 'List of chat rooms with pagination' }
                }
            },
            post: {
                tags: ['ChatRooms'],
                summary: 'Create a new chat room (Admin)',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['name'],
                                properties: {
                                    name: { type: 'string' },
                                    image: { type: 'string' },
                                    description: { type: 'string' },
                                    accessType: { type: 'string', enum: ['public', 'private'], default: 'public' },
                                    settings: { type: 'object' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    201: { description: 'Chat room created' },
                    400: { description: 'Room name required or already exists' }
                }
            }
        },
        '/api/v1/chat-rooms/public': {
            get: {
                tags: ['ChatRooms'],
                summary: 'List public active chat rooms',
                security: [{ bearerAuth: [] }],
                responses: {
                    200: { description: 'List of public rooms' }
                }
            }
        },
        '/api/v1/chat-rooms/{id}': {
            get: {
                tags: ['ChatRooms'],
                summary: 'Get a single chat room',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Room MongoDB ID' }],
                responses: {
                    200: { description: 'Chat room data' },
                    403: { description: 'No access to private room' },
                    404: { description: 'Room not found' }
                }
            },
            put: {
                tags: ['ChatRooms'],
                summary: 'Update a chat room (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' },
                                    image: { type: 'string' },
                                    description: { type: 'string' },
                                    accessType: { type: 'string', enum: ['public', 'private'] },
                                    settings: { type: 'object' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Room updated' },
                    404: { description: 'Room not found' }
                }
            },
            delete: {
                tags: ['ChatRooms'],
                summary: 'Delete a chat room (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'Room deleted' },
                    404: { description: 'Room not found' }
                }
            }
        },
        '/api/v1/chat-rooms/{id}/messages': {
            get: {
                tags: ['ChatRooms'],
                summary: 'Get room messages (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
                    { name: 'search', in: 'query', schema: { type: 'string' } }
                ],
                responses: {
                    200: { description: 'Room messages with pagination' },
                    404: { description: 'Room not found' }
                }
            },
            delete: {
                tags: ['ChatRooms'],
                summary: 'Delete all room messages (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'All messages deleted' },
                    404: { description: 'Room not found' }
                }
            }
        },
        '/api/v1/chat-rooms/{id}/toggle-active': {
            put: {
                tags: ['ChatRooms'],
                summary: 'Toggle room active status (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Room active status toggled' }, 404: { description: 'Room not found' } }
            }
        },
        '/api/v1/chat-rooms/{id}/toggle-lock': {
            put: {
                tags: ['ChatRooms'],
                summary: 'Toggle room lock status (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Room lock status toggled' }, 404: { description: 'Room not found' } }
            }
        },
        '/api/v1/chat-rooms/{id}/stats': {
            get: {
                tags: ['ChatRooms'],
                summary: 'Get room statistics (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Room stats including member count, message count, today messages' }, 404: { description: 'Room not found' } }
            }
        },
        '/api/v1/chat-rooms/{id}/pin': {
            put: {
                tags: ['ChatRooms'],
                summary: 'Pin/unpin an announcement in room (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    content: { 'application/json': { schema: { type: 'object', properties: { content: { type: 'string', description: 'Empty string to unpin' } } } } }
                },
                responses: { 200: { description: 'Pinned message updated/removed' }, 404: { description: 'Room not found' } }
            }
        },
        '/api/v1/chat-rooms/{id}/upload-image': {
            post: {
                tags: ['ChatRooms'],
                summary: 'Upload room image (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: { 'multipart/form-data': { schema: { type: 'object', properties: { roomImage: { type: 'string', format: 'binary' } } } } }
                },
                responses: { 200: { description: 'Image uploaded' }, 400: { description: 'No image' }, 404: { description: 'Room not found' } }
            }
        },
        '/api/v1/chat-rooms/{id}/reports': {
            get: {
                tags: ['ChatRooms'],
                summary: 'Get room reports (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'List of reports related to room' }, 404: { description: 'Room not found' } }
            }
        },

        // ============================================================
        //  MESSAGES (Admin)
        // ============================================================
        '/api/v1/messages/conversation/{conversationId}': {
            get: {
                tags: ['Messages'],
                summary: 'Get messages of a conversation (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'conversationId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
                    { name: 'search', in: 'query', schema: { type: 'string' } }
                ],
                responses: { 200: { description: 'Messages with pagination' }, 404: { description: 'Conversation not found' } }
            }
        },
        '/api/v1/messages/{id}': {
            get: {
                tags: ['Messages'],
                summary: 'Get a single message (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Message data' }, 404: { description: 'Message not found' } }
            },
            delete: {
                tags: ['Messages'],
                summary: 'Soft delete a message (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Message soft-deleted' }, 404: { description: 'Message not found' } }
            }
        },
        '/api/v1/messages/{id}/permanent': {
            delete: {
                tags: ['Messages'],
                summary: 'Permanently delete a message (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Message permanently deleted' }, 404: { description: 'Message not found' } }
            }
        },
        '/api/v1/messages/send': {
            post: {
                tags: ['Messages'],
                summary: 'Send a message in a conversation (Admin)',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['conversationId', 'content'],
                                properties: {
                                    conversationId: { type: 'string' },
                                    content: { type: 'string' },
                                    type: { type: 'string', enum: ['text', 'image', 'audio', 'video', 'file'], default: 'text' }
                                }
                            }
                        }
                    }
                },
                responses: { 200: { description: 'Message sent' }, 404: { description: 'Conversation not found' } }
            }
        },
        '/api/v1/messages/stats/{conversationId}': {
            get: {
                tags: ['Messages'],
                summary: 'Get conversation message statistics (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'conversationId', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Message stats by type, deleted count, etc.' } }
            }
        },

        // ============================================================
        //  NOTIFICATIONS (Admin)
        // ============================================================
        '/api/v1/notifications': {
            get: {
                tags: ['Notifications'],
                summary: 'List all notifications (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
                    { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'sent', 'failed'] } },
                    { name: 'type', in: 'query', schema: { type: 'string' } }
                ],
                responses: { 200: { description: 'Notifications list with pagination' } }
            }
        },
        '/api/v1/notifications/stats': {
            get: {
                tags: ['Notifications'],
                summary: 'Notification statistics (Admin)',
                security: [{ bearerAuth: [] }],
                responses: { 200: { description: 'Counts by status and type' } }
            }
        },
        '/api/v1/notifications/send': {
            post: {
                tags: ['Notifications'],
                summary: 'Send a push notification (Admin)',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['title', 'body'],
                                properties: {
                                    title: { type: 'string' },
                                    body: { type: 'string' },
                                    type: { type: 'string', default: 'general' },
                                    recipients: { type: 'string', enum: ['all', 'specific'], default: 'all' },
                                    targetUserIds: { type: 'array', items: { type: 'string' }, description: 'Required when recipients=specific' },
                                    priority: { type: 'string', enum: ['low', 'normal', 'high'], default: 'normal' },
                                    data: { type: 'object' },
                                    sound: { type: 'string', default: 'default' },
                                    badge: { type: 'integer', default: 1 }
                                }
                            }
                        }
                    }
                },
                responses: { 200: { description: 'Notification sent with results' }, 400: { description: 'Title and body required' } }
            }
        },
        '/api/v1/notifications/{id}': {
            get: {
                tags: ['Notifications'],
                summary: 'Get a single notification (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Notification data' }, 404: { description: 'Not found' } }
            },
            delete: {
                tags: ['Notifications'],
                summary: 'Delete a notification (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Deleted' }, 404: { description: 'Not found' } }
            }
        },
        '/api/v1/notifications/{id}/resend': {
            post: {
                tags: ['Notifications'],
                summary: 'Resend a notification (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Notification resent' }, 404: { description: 'Not found' } }
            }
        },

        // ============================================================
        //  SETTINGS
        // ============================================================
        '/api/v1/settings': {
            get: {
                tags: ['Settings'],
                summary: 'Get app settings (public fields for all, full for admin)',
                responses: { 200: { description: 'Settings data', content: { 'application/json': { schema: { $ref: '#/components/schemas/Settings' } } } } }
            },
            put: {
                tags: ['Settings'],
                summary: 'Update app settings (Admin)',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    appName: { type: 'string' },
                                    appVersion: { type: 'string' },
                                    appLogo: { type: 'string' },
                                    privacyPolicy: { type: 'string' },
                                    termsOfService: { type: 'string' },
                                    aboutApp: { type: 'string' },
                                    notificationsEnabled: { type: 'boolean' },
                                    emailNotifications: { type: 'boolean' },
                                    maxConversationParticipants: { type: 'integer' },
                                    maxMessageLength: { type: 'integer' },
                                    allowFileUploads: { type: 'boolean' },
                                    maxFileSize: { type: 'integer' },
                                    contactEmail: { type: 'string' },
                                    contactPhone: { type: 'string' },
                                    websiteUrl: { type: 'string' },
                                    socialMedia: { type: 'object' }
                                }
                            }
                        }
                    }
                },
                responses: { 200: { description: 'Settings updated' } }
            }
        },
        '/api/v1/settings/privacy-policy': {
            get: { tags: ['Settings'], summary: 'Get privacy policy (Public)', responses: { 200: { description: 'Privacy policy content' } } }
        },
        '/api/v1/settings/terms': {
            get: { tags: ['Settings'], summary: 'Get terms of service (Public)', responses: { 200: { description: 'Terms of service content' } } }
        },
        '/api/v1/settings/about': {
            get: { tags: ['Settings'], summary: 'Get about app info (Public)', responses: { 200: { description: 'About app content' } } }
        },
        '/api/v1/settings/contact-us': {
            get: { tags: ['Settings'], summary: 'Get contact information (Public)', responses: { 200: { description: 'Contact info and social media' } } }
        },
        '/api/v1/settings/content/{type}': {
            put: {
                tags: ['Settings'],
                summary: 'Update content page (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string', enum: ['privacy', 'terms', 'about', 'contact'] } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', required: ['content'], properties: { content: { type: 'string' } } } } }
                },
                responses: { 200: { description: 'Content updated' }, 400: { description: 'Invalid type or missing content' } }
            }
        },

        // ============================================================
        //  BANNED WORDS (Admin)
        // ============================================================
        '/api/v1/banned-words': {
            get: {
                tags: ['BannedWords'],
                summary: 'List all banned words (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'type', in: 'query', schema: { type: 'string', enum: ['word', 'username', 'both'] } },
                    { name: 'isActive', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
                    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }
                ],
                responses: { 200: { description: 'Banned words list with pagination' } }
            },
            post: {
                tags: ['BannedWords'],
                summary: 'Add a banned word (Admin)',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['word'],
                                properties: {
                                    word: { type: 'string' },
                                    type: { type: 'string', enum: ['word', 'username', 'both'], default: 'both' },
                                    severity: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
                                    action: { type: 'string', enum: ['filter', 'block', 'warn'], default: 'filter' }
                                }
                            }
                        }
                    }
                },
                responses: { 201: { description: 'Word added' }, 400: { description: 'Word required or already exists' } }
            }
        },
        '/api/v1/banned-words/stats': {
            get: {
                tags: ['BannedWords'],
                summary: 'Banned words statistics (Admin)',
                security: [{ bearerAuth: [] }],
                responses: { 200: { description: 'Stats by type, severity, and most used' } }
            }
        },
        '/api/v1/banned-words/bulk': {
            post: {
                tags: ['BannedWords'],
                summary: 'Add multiple banned words (Admin)',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['words'],
                                properties: {
                                    words: { type: 'array', items: { type: 'string' } },
                                    type: { type: 'string', enum: ['word', 'username', 'both'], default: 'both' },
                                    severity: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
                                    action: { type: 'string', enum: ['filter', 'block', 'warn'], default: 'filter' }
                                }
                            }
                        }
                    }
                },
                responses: { 201: { description: 'Bulk add results with added/skipped counts' } }
            }
        },
        '/api/v1/banned-words/check': {
            post: {
                tags: ['BannedWords'],
                summary: 'Check text for banned words (Admin)',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, type: { type: 'string', enum: ['word', 'username', 'both'], default: 'both' } } } } }
                },
                responses: { 200: { description: 'Check results with found words' } }
            }
        },
        '/api/v1/banned-words/{id}': {
            put: {
                tags: ['BannedWords'],
                summary: 'Update a banned word (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    content: { 'application/json': { schema: { type: 'object', properties: { word: { type: 'string' }, type: { type: 'string' }, severity: { type: 'string' }, action: { type: 'string' }, isActive: { type: 'boolean' } } } } }
                },
                responses: { 200: { description: 'Word updated' }, 404: { description: 'Word not found' } }
            },
            delete: {
                tags: ['BannedWords'],
                summary: 'Delete a banned word (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Word deleted' }, 404: { description: 'Word not found' } }
            }
        },
        '/api/v1/banned-words/{id}/toggle': {
            put: {
                tags: ['BannedWords'],
                summary: 'Toggle banned word active status (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Status toggled' }, 404: { description: 'Word not found' } }
            }
        },

        // ============================================================
        //  ACTIVITY LOGS (Admin)
        // ============================================================
        '/api/v1/activity-logs': {
            get: {
                tags: ['ActivityLogs'],
                summary: 'List activity logs (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
                    { name: 'search', in: 'query', schema: { type: 'string' } },
                    { name: 'action', in: 'query', schema: { type: 'string' } },
                    { name: 'userId', in: 'query', schema: { type: 'string' } },
                    { name: 'severity', in: 'query', schema: { type: 'string', enum: ['low', 'medium', 'high'] } },
                    { name: 'status', in: 'query', schema: { type: 'string', enum: ['success', 'failure'] } },
                    { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
                    { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } },
                    { name: 'sortBy', in: 'query', schema: { type: 'string', default: 'createdAt' } },
                    { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } }
                ],
                responses: { 200: { description: 'Activity logs with pagination' } }
            }
        },
        '/api/v1/activity-logs/user/{userId}': {
            get: {
                tags: ['ActivityLogs'],
                summary: 'Get activity logs for a specific user (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
                ],
                responses: { 200: { description: 'User activity logs' } }
            }
        },
        '/api/v1/activity-logs/stats/overview': {
            get: {
                tags: ['ActivityLogs'],
                summary: 'Activity logs statistics overview (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'days', in: 'query', schema: { type: 'integer', default: 7 }, description: 'Number of days to look back' }],
                responses: { 200: { description: 'Stats: by action, severity, status, most active users, daily activity' } }
            }
        },
        '/api/v1/activity-logs/{id}': {
            get: {
                tags: ['ActivityLogs'],
                summary: 'Get a single activity log (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Activity log data' }, 404: { description: 'Not found' } }
            },
            delete: {
                tags: ['ActivityLogs'],
                summary: 'Delete an activity log (Admin)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Log deleted' }, 404: { description: 'Not found' } }
            }
        },
        '/api/v1/activity-logs/bulk/delete': {
            delete: {
                tags: ['ActivityLogs'],
                summary: 'Bulk delete old activity logs (Admin)',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    content: { 'application/json': { schema: { type: 'object', properties: { days: { type: 'integer', default: 90, description: 'Delete logs older than this many days' } } } } }
                },
                responses: { 200: { description: 'Old logs deleted with count' } }
            }
        },

        // ============================================================
        //  MOBILE - USERS
        // ============================================================
        '/api/v1/mobile/users/location': {
            put: {
                tags: ['Mobile - Users'],
                summary: 'Update user geolocation',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', required: ['latitude', 'longitude'], properties: { latitude: { type: 'number', minimum: -90, maximum: 90, example: 24.7136 }, longitude: { type: 'number', minimum: -180, maximum: 180, example: 46.6753 } } } } }
                },
                responses: { 200: { description: 'Location updated' }, 400: { description: 'Invalid coordinates' } }
            }
        },
        '/api/v1/mobile/users/search': {
            get: {
                tags: ['Mobile - Users'],
                summary: 'Search users with advanced filters',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search by name (min 2 chars)' },
                    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
                    { name: 'gender', in: 'query', schema: { type: 'string', enum: ['male', 'female'] } },
                    { name: 'country', in: 'query', schema: { type: 'string' }, description: 'Country code (SA, AE, EG)' },
                    { name: 'minAge', in: 'query', schema: { type: 'integer' } },
                    { name: 'maxAge', in: 'query', schema: { type: 'integer' } },
                    { name: 'latitude', in: 'query', schema: { type: 'number' } },
                    { name: 'longitude', in: 'query', schema: { type: 'number' } },
                    { name: 'maxDistance', in: 'query', schema: { type: 'number', default: 50 }, description: 'Max distance in km' }
                ],
                responses: { 200: { description: 'List of matching users with distance info when location provided' } }
            }
        },

        // ============================================================
        //  MOBILE - PROFILE
        // ============================================================
        '/api/v1/mobile/profile-views': {
            post: {
                tags: ['Mobile - Profile'],
                summary: 'Record a profile view',
                security: [{ bearerAuth: [] }],
                requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['viewedUserId'], properties: { viewedUserId: { type: 'string' } } } } } },
                responses: { 200: { description: 'View recorded' }, 400: { description: 'Invalid request' }, 404: { description: 'User not found' } }
            },
            get: {
                tags: ['Mobile - Profile'],
                summary: 'Get who viewed my profile (premium: full details, free: count only)',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
                ],
                responses: { 200: { description: 'Profile views (details for premium, masked for free)' } }
            }
        },
        '/api/v1/mobile/verification/submit': {
            post: {
                tags: ['Mobile - Profile'],
                summary: 'Submit verification selfie (Premium)',
                security: [{ bearerAuth: [] }],
                requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { selfie: { type: 'string', format: 'binary' } } } } } },
                responses: { 200: { description: 'Verification request submitted' }, 400: { description: 'No selfie or pending request exists' } }
            }
        },
        '/api/v1/mobile/verification/status': {
            get: {
                tags: ['Mobile - Profile'],
                summary: 'Get verification status',
                security: [{ bearerAuth: [] }],
                responses: { 200: { description: 'Verification status (none, pending, approved, rejected)' } }
            }
        },
        '/api/v1/mobile/users/stealth-mode': {
            put: {
                tags: ['Mobile - Profile'],
                summary: 'Toggle stealth mode (Premium)',
                security: [{ bearerAuth: [] }],
                requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' } } } } } },
                responses: { 200: { description: 'Stealth mode toggled' }, 400: { description: 'Invalid value' } }
            }
        },
        '/api/v1/mobile/privacy/settings': {
            get: {
                tags: ['Mobile - Profile'],
                summary: 'Get privacy settings',
                security: [{ bearerAuth: [] }],
                responses: { 200: { description: 'Privacy settings (profileVisibility, showLastSeen, notificationSound, showDistance, stealthMode)' } }
            }
        },
        '/api/v1/mobile/privacy/distance': {
            patch: {
                tags: ['Mobile - Profile'],
                summary: 'Toggle distance visibility',
                security: [{ bearerAuth: [] }],
                requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['showDistance'], properties: { showDistance: { type: 'boolean' } } } } } },
                responses: { 200: { description: 'Distance setting updated' } }
            }
        },
        '/api/v1/mobile/privacy/stealth': {
            patch: {
                tags: ['Mobile - Profile'],
                summary: 'Toggle stealth mode via privacy settings (Premium)',
                security: [{ bearerAuth: [] }],
                requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['stealthMode'], properties: { stealthMode: { type: 'boolean' } } } } } },
                responses: { 200: { description: 'Stealth mode updated' } }
            }
        },

        // ============================================================
        //  MOBILE - PREMIUM
        // ============================================================
        '/api/v1/mobile/super-like': {
            post: {
                tags: ['Mobile - Premium'],
                summary: 'Send a Super Like',
                security: [{ bearerAuth: [] }],
                requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['userId'], properties: { userId: { type: 'string', description: 'Target user ID' } } } } } },
                responses: { 200: { description: 'Super Like sent with remaining count and conversation ID' }, 404: { description: 'User not found' }, 429: { description: 'Daily limit reached' } }
            }
        },
        '/api/v1/mobile/super-like/remaining': {
            get: {
                tags: ['Mobile - Premium'],
                summary: 'Get remaining Super Likes for today',
                security: [{ bearerAuth: [] }],
                responses: { 200: { description: 'Remaining, max, used counts and reset time' } }
            }
        },
        '/api/v1/mobile/subscription/verify': {
            post: {
                tags: ['Mobile - Premium'],
                summary: 'Verify Apple receipt and activate subscription',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['plan'],
                                properties: {
                                    receipt: { type: 'string', description: 'StoreKit 1 receipt data' },
                                    transactionId: { type: 'string', description: 'StoreKit 2 transaction ID' },
                                    originalTransactionId: { type: 'string' },
                                    plan: { type: 'string', enum: ['weekly', 'monthly', 'quarterly'] }
                                }
                            }
                        }
                    }
                },
                responses: { 200: { description: 'Subscription activated with plan and expiry date' }, 400: { description: 'Invalid receipt or plan' } }
            }
        },
        '/api/v1/mobile/subscription/status': {
            get: {
                tags: ['Mobile - Premium'],
                summary: 'Get current subscription status',
                security: [{ bearerAuth: [] }],
                responses: { 200: { description: 'isPremium, plan, expiresAt' } }
            }
        },

        // ============================================================
        //  MOBILE - BLOCKING
        // ============================================================
        '/api/v1/mobile/users/block/{userId}': {
            post: {
                tags: ['Mobile - Blocking'],
                summary: 'Block a user',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'User blocked and conversation deleted' }, 400: { description: 'Cannot block yourself' }, 404: { description: 'User not found' } }
            }
        },
        '/api/v1/mobile/users/unblock/{userId}': {
            post: {
                tags: ['Mobile - Blocking'],
                summary: 'Unblock a user',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'User unblocked' }, 404: { description: 'User not found' } }
            }
        },
        '/api/v1/mobile/users/blocked': {
            get: {
                tags: ['Mobile - Blocking'],
                summary: 'Get blocked users list',
                security: [{ bearerAuth: [] }],
                responses: { 200: { description: 'List of blocked users' } }
            }
        },

        // ============================================================
        //  MOBILE - CONVERSATIONS
        // ============================================================
        '/api/v1/mobile/conversations': {
            get: {
                tags: ['Mobile - Conversations'],
                summary: 'Get user active conversations with unread counts',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
                ],
                responses: { 200: { description: 'Conversations with unread counts and pagination' } }
            }
        },
        '/api/v1/mobile/conversations/request': {
            post: {
                tags: ['Mobile - Conversations'],
                summary: 'Request a new conversation (optionally with Super Like)',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['targetUserId'],
                                properties: {
                                    targetUserId: { type: 'string' },
                                    initialMessage: { type: 'string' },
                                    isSuperLike: { type: 'boolean', default: false }
                                }
                            }
                        }
                    }
                },
                responses: { 201: { description: 'Conversation request created' }, 200: { description: 'Conversation already exists' }, 429: { description: 'Super Like limit reached' } }
            }
        },
        '/api/v1/mobile/conversations/pending': {
            get: {
                tags: ['Mobile - Conversations'],
                summary: 'Get pending conversation requests',
                security: [{ bearerAuth: [] }],
                responses: { 200: { description: 'Pending requests sorted by Super Like first' } }
            }
        },
        '/api/v1/mobile/conversations/{id}/accept': {
            put: {
                tags: ['Mobile - Conversations'],
                summary: 'Accept a conversation request',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Conversation accepted' }, 400: { description: 'Cannot accept own request' }, 403: { description: 'Not a participant' }, 404: { description: 'Not found' } }
            }
        },
        '/api/v1/mobile/conversations/{id}/reject': {
            put: {
                tags: ['Mobile - Conversations'],
                summary: 'Reject a conversation request',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Conversation rejected' }, 400: { description: 'Cannot reject own request' }, 403: { description: 'Not a participant' }, 404: { description: 'Not found' } }
            }
        },
        '/api/v1/mobile/conversations/{id}/read': {
            put: {
                tags: ['Mobile - Conversations'],
                summary: 'Mark all messages as read in a conversation',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Messages marked as read with count' }, 403: { description: 'Not a participant' }, 404: { description: 'Not found' } }
            }
        },
        '/api/v1/mobile/conversations/{id}/mute': {
            put: {
                tags: ['Mobile - Conversations'],
                summary: 'Mute/unmute conversation notifications',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', required: ['muted'], properties: { muted: { type: 'boolean' }, mutedUntil: { type: 'string', format: 'date-time', nullable: true } } } } }
                },
                responses: { 200: { description: 'Mute status updated' }, 403: { description: 'Not a participant' }, 404: { description: 'Not found' } }
            }
        },

        // ============================================================
        //  MOBILE - MESSAGES
        // ============================================================
        '/api/v1/mobile/messages/send': {
            post: {
                tags: ['Mobile - Messages'],
                summary: 'Send a message in a conversation',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['conversationId', 'content'],
                                properties: {
                                    conversationId: { type: 'string' },
                                    content: { type: 'string' },
                                    type: { type: 'string', enum: ['text', 'image', 'audio', 'video', 'file'], default: 'text' },
                                    mediaUrl: { type: 'string' },
                                    mediaMetadata: { type: 'object' }
                                }
                            }
                        }
                    }
                },
                responses: { 201: { description: 'Message sent' }, 400: { description: 'Missing fields or inactive conversation' }, 403: { description: 'Not a participant' }, 404: { description: 'Conversation not found' } }
            }
        },
        '/api/v1/mobile/conversations/{conversationId}/messages': {
            post: {
                tags: ['Mobile - Messages'],
                summary: 'Send a message (alternative iOS-compatible route)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'conversationId', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['content'],
                                properties: {
                                    content: { type: 'string' },
                                    type: { type: 'string', enum: ['text', 'image', 'audio', 'video', 'file'], default: 'text' },
                                    mediaUrl: { type: 'string' },
                                    mediaMetadata: { type: 'object' }
                                }
                            }
                        }
                    }
                },
                responses: { 201: { description: 'Message sent' }, 403: { description: 'Not a participant' }, 404: { description: 'Conversation not found' } }
            }
        },
        '/api/v1/mobile/conversations/{conversationId}/messages/image': {
            post: {
                tags: ['Mobile - Messages'],
                summary: 'Send an image message (multipart upload)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'conversationId', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: { 'multipart/form-data': { schema: { type: 'object', properties: { image: { type: 'string', format: 'binary' }, caption: { type: 'string' } } } } }
                },
                responses: { 201: { description: 'Image message sent' }, 400: { description: 'No image uploaded' }, 403: { description: 'Not a participant' }, 404: { description: 'Conversation not found' } }
            }
        },
        '/api/v1/mobile/messages/{conversationId}': {
            get: {
                tags: ['Mobile - Messages'],
                summary: 'Get messages of a conversation',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'conversationId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }
                ],
                responses: { 200: { description: 'Messages with pagination' }, 403: { description: 'Not a participant' }, 404: { description: 'Conversation not found' } }
            }
        },

        // ============================================================
        //  MOBILE - REPORTS
        // ============================================================
        '/api/v1/mobile/reports': {
            post: {
                tags: ['Mobile - Reports'],
                summary: 'Submit a user report',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['reportedUser', 'reason'],
                                properties: {
                                    reportedUser: { type: 'string', description: 'User ID to report' },
                                    reason: { type: 'string', enum: ['spam', 'inappropriate', 'harassment', 'fake_profile', 'other'] },
                                    description: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                responses: { 201: { description: 'Report submitted' }, 400: { description: 'Invalid reason or self-report' }, 404: { description: 'User not found' } }
            }
        },
        '/api/v1/mobile/reports/my': {
            get: {
                tags: ['Mobile - Reports'],
                summary: 'Get my submitted reports',
                security: [{ bearerAuth: [] }],
                responses: { 200: { description: 'List of user reports' } }
            }
        },

        // ============================================================
        //  MOBILE - NOTIFICATIONS
        // ============================================================
        '/api/v1/mobile/notifications': {
            get: {
                tags: ['Mobile - Notifications'],
                summary: 'Get user notifications',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
                ],
                responses: { 200: { description: 'Notifications with unread count and pagination' } }
            }
        },
        '/api/v1/mobile/notifications/{id}/read': {
            put: {
                tags: ['Mobile - Notifications'],
                summary: 'Mark a notification as read',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Notification marked as read' }, 404: { description: 'Not found' } }
            }
        },
        '/api/v1/mobile/notifications/read-all': {
            put: {
                tags: ['Mobile - Notifications'],
                summary: 'Mark all notifications as read',
                security: [{ bearerAuth: [] }],
                responses: { 200: { description: 'All notifications marked as read' } }
            }
        },
        '/api/v1/mobile/device/register-token': {
            post: {
                tags: ['Mobile - Notifications'],
                summary: 'Register FCM/APNs device token',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    fcmToken: { type: 'string', description: 'Firebase Cloud Messaging token' },
                                    deviceToken: { type: 'string', description: 'APNs device token' },
                                    platform: { type: 'string', enum: ['ios', 'android'] },
                                    osVersion: { type: 'string' },
                                    appVersion: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                responses: { 200: { description: 'Token registered' }, 400: { description: 'Token required' } }
            }
        },
        '/api/v1/mobile/device/unregister-token': {
            delete: {
                tags: ['Mobile - Notifications'],
                summary: 'Unregister device token (on logout)',
                security: [{ bearerAuth: [] }],
                responses: { 200: { description: 'Token unregistered' } }
            }
        },
        '/api/v1/mobile/device/update-token': {
            put: {
                tags: ['Mobile - Notifications'],
                summary: 'Update FCM/APNs token',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    content: { 'application/json': { schema: { type: 'object', properties: { fcmToken: { type: 'string' }, deviceToken: { type: 'string' } } } } }
                },
                responses: { 200: { description: 'Token updated' }, 400: { description: 'Token required' } }
            }
        },

        // ============================================================
        //  MOBILE - ROOMS
        // ============================================================
        '/api/v1/mobile/rooms': {
            get: {
                tags: ['Mobile - Rooms'],
                summary: 'List public chat rooms for mobile',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
                    { name: 'category', in: 'query', schema: { type: 'string' } },
                    { name: 'search', in: 'query', schema: { type: 'string' } }
                ],
                responses: { 200: { description: 'Rooms list with online count, isJoined, pinned message' } }
            }
        },
        '/api/v1/mobile/rooms/{id}/messages': {
            get: {
                tags: ['Mobile - Rooms'],
                summary: 'Get room messages',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
                    { name: 'search', in: 'query', schema: { type: 'string' } }
                ],
                responses: { 200: { description: 'Room messages with pagination' }, 404: { description: 'Room not found' } }
            },
            post: {
                tags: ['Mobile - Rooms'],
                summary: 'Send a text message in a room',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', required: ['content'], properties: { content: { type: 'string' }, type: { type: 'string', default: 'text' } } } } }
                },
                responses: { 201: { description: 'Message sent' }, 403: { description: 'Room inactive or locked' }, 404: { description: 'Room not found' } }
            }
        },
        '/api/v1/mobile/rooms/{id}/messages/image': {
            post: {
                tags: ['Mobile - Rooms'],
                summary: 'Send an image message in a room',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: { 'multipart/form-data': { schema: { type: 'object', properties: { image: { type: 'string', format: 'binary' }, caption: { type: 'string' } } } } }
                },
                responses: { 201: { description: 'Image sent' }, 400: { description: 'No image' }, 403: { description: 'Images not allowed in room' }, 404: { description: 'Room not found' } }
            }
        },
        '/api/v1/mobile/rooms/{id}/online-members': {
            get: {
                tags: ['Mobile - Rooms'],
                summary: 'Get online members in a room',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Online members list with count' }, 404: { description: 'Room not found' } }
            }
        },
        '/api/v1/mobile/rooms/{id}/report': {
            post: {
                tags: ['Mobile - Rooms'],
                summary: 'Report content in a room',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', required: ['reason'], properties: { messageId: { type: 'string' }, reason: { type: 'string', enum: ['spam', 'inappropriate', 'harassment'] }, details: { type: 'string' } } } } }
                },
                responses: { 200: { description: 'Report submitted' }, 400: { description: 'Invalid reason' }, 404: { description: 'Room not found' } }
            }
        },
        '/api/v1/mobile/rooms/{id}/mute': {
            put: {
                tags: ['Mobile - Rooms'],
                summary: 'Mute/unmute room notifications',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['muted'], properties: { muted: { type: 'boolean' } } } } } },
                responses: { 200: { description: 'Mute status updated' }, 404: { description: 'Room not found' } }
            }
        },
        '/api/v1/mobile/categories': {
            get: {
                tags: ['Mobile - Rooms'],
                summary: 'Get active room categories',
                responses: { 200: { description: 'List of categories with name, icon, color, description, roomsCount' } }
            }
        }
    }
};

const swaggerSpec = swaggerJsdoc({
    definition: swaggerDefinition,
    apis: [] // We define paths inline above, no need to scan files
});

/**
 * Setup Swagger UI on the Express app
 * @param {import('express').Application} app - Express app instance
 */
function setupSwagger(app) {
    // Swagger JSON endpoint
    app.get('/api-docs.json', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(swaggerSpec);
    });

    // Swagger UI
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'HalaChat API Docs',
        swaggerOptions: {
            persistAuthorization: true,
            docExpansion: 'none',
            filter: true,
            tagsSorter: 'alpha'
        }
    }));
}

module.exports = { setupSwagger, swaggerSpec };
