"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInMemoryOtpStore = exports.consoleSender = exports.channelRouter = exports.twilioSmsSender = exports.smtpEmailSender = exports.normalizeDestination = exports.createOtpService = exports.DEFAULT_OTP_OPTIONS = exports.OtpError = void 0;
var types_1 = require("./types");
Object.defineProperty(exports, "OtpError", { enumerable: true, get: function () { return types_1.OtpError; } });
Object.defineProperty(exports, "DEFAULT_OTP_OPTIONS", { enumerable: true, get: function () { return types_1.DEFAULT_OTP_OPTIONS; } });
var service_1 = require("./service");
Object.defineProperty(exports, "createOtpService", { enumerable: true, get: function () { return service_1.createOtpService; } });
Object.defineProperty(exports, "normalizeDestination", { enumerable: true, get: function () { return service_1.normalizeDestination; } });
var senders_1 = require("./senders");
Object.defineProperty(exports, "smtpEmailSender", { enumerable: true, get: function () { return senders_1.smtpEmailSender; } });
Object.defineProperty(exports, "twilioSmsSender", { enumerable: true, get: function () { return senders_1.twilioSmsSender; } });
Object.defineProperty(exports, "channelRouter", { enumerable: true, get: function () { return senders_1.channelRouter; } });
Object.defineProperty(exports, "consoleSender", { enumerable: true, get: function () { return senders_1.consoleSender; } });
var memory_1 = require("./memory");
Object.defineProperty(exports, "createInMemoryOtpStore", { enumerable: true, get: function () { return memory_1.createInMemoryOtpStore; } });
//# sourceMappingURL=index.js.map