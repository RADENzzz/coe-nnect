"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var supabase_js_1 = require("@supabase/supabase-js");
var readline = require("node:readline");
var dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
var ask = function (q) { return new Promise(function (resolve) { return rl.question(q, resolve); }); };
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var url, serviceKey, supabase, email, password, username, role, deptId, facultyId, _a, data, error;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    console.log('\n--- CoE-NNECT: Create User Account ---\n');
                    url = process.env.SUPABASE_URL;
                    serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
                    if (!url || !serviceKey) {
                        console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
                        process.exit(1);
                    }
                    supabase = (0, supabase_js_1.createClient)(url, serviceKey, {
                        auth: { autoRefreshToken: false, persistSession: false },
                    });
                    return [4 /*yield*/, ask('Email: ')];
                case 1:
                    email = (_b.sent()).trim();
                    return [4 /*yield*/, ask('Password (min 8): ')];
                case 2:
                    password = (_b.sent()).trim();
                    return [4 /*yield*/, ask('Username: ')];
                case 3:
                    username = (_b.sent()).trim();
                    return [4 /*yield*/, ask('Role (administrator | college_dean | department_head | viewer): ')];
                case 4:
                    role = (_b.sent()).trim();
                    return [4 /*yield*/, ask('Department ID (optional, blank if none): ')];
                case 5:
                    deptId = (_b.sent()).trim();
                    return [4 /*yield*/, ask('Faculty ID (optional, blank if none): ')];
                case 6:
                    facultyId = (_b.sent()).trim();
                    console.log('\nCreating user...\n');
                    return [4 /*yield*/, supabase.auth.admin.createUser({
                            email: email,
                            password: password,
                            email_confirm: true,
                            app_metadata: {
                                role: role,
                                username: username,
                                dept_id: deptId || null,
                                faculty_id: facultyId || null,
                            },
                        })];
                case 7:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error) {
                        console.error('❌ Error:', error.message);
                    }
                    else {
                        console.log('✅ User created');
                        console.log("   Email:    ".concat(data.user.email));
                        console.log("   User ID:  ".concat(data.user.id));
                        console.log("   Role:     ".concat(role));
                        console.log('\nThe trigger `handle_new_auth_user` populated public.users.');
                    }
                    rl.close();
                    return [2 /*return*/];
            }
        });
    });
}
main().catch(function (err) {
    console.error(err);
    process.exit(1);
});
