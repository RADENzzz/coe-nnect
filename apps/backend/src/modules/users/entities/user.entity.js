"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
var typeorm_1 = require("typeorm");
var User = function () {
    var _classDecorators = [(0, typeorm_1.Entity)('users')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _userId_decorators;
    var _userId_initializers = [];
    var _userId_extraInitializers = [];
    var _username_decorators;
    var _username_initializers = [];
    var _username_extraInitializers = [];
    var _email_decorators;
    var _email_initializers = [];
    var _email_extraInitializers = [];
    var _employeeId_decorators;
    var _employeeId_initializers = [];
    var _employeeId_extraInitializers = [];
    var _wmsuId_decorators;
    var _wmsuId_initializers = [];
    var _wmsuId_extraInitializers = [];
    var _role_decorators;
    var _role_initializers = [];
    var _role_extraInitializers = [];
    var _deptId_decorators;
    var _deptId_initializers = [];
    var _deptId_extraInitializers = [];
    var _facultyId_decorators;
    var _facultyId_initializers = [];
    var _facultyId_extraInitializers = [];
    var _isActive_decorators;
    var _isActive_initializers = [];
    var _isActive_extraInitializers = [];
    var _createdAt_decorators;
    var _createdAt_initializers = [];
    var _createdAt_extraInitializers = [];
    var _updatedAt_decorators;
    var _updatedAt_initializers = [];
    var _updatedAt_extraInitializers = [];
    var User = _classThis = /** @class */ (function () {
        function User_1() {
            this.userId = __runInitializers(this, _userId_initializers, void 0);
            this.username = (__runInitializers(this, _userId_extraInitializers), __runInitializers(this, _username_initializers, void 0));
            this.email = (__runInitializers(this, _username_extraInitializers), __runInitializers(this, _email_initializers, void 0));
            this.employeeId = (__runInitializers(this, _email_extraInitializers), __runInitializers(this, _employeeId_initializers, void 0));
            this.wmsuId = (__runInitializers(this, _employeeId_extraInitializers), __runInitializers(this, _wmsuId_initializers, void 0));
            this.role = (__runInitializers(this, _wmsuId_extraInitializers), __runInitializers(this, _role_initializers, void 0));
            this.deptId = (__runInitializers(this, _role_extraInitializers), __runInitializers(this, _deptId_initializers, void 0));
            this.facultyId = (__runInitializers(this, _deptId_extraInitializers), __runInitializers(this, _facultyId_initializers, void 0));
            this.isActive = (__runInitializers(this, _facultyId_extraInitializers), __runInitializers(this, _isActive_initializers, void 0));
            this.createdAt = (__runInitializers(this, _isActive_extraInitializers), __runInitializers(this, _createdAt_initializers, void 0));
            this.updatedAt = (__runInitializers(this, _createdAt_extraInitializers), __runInitializers(this, _updatedAt_initializers, void 0));
            __runInitializers(this, _updatedAt_extraInitializers);
        }
        return User_1;
    }());
    __setFunctionName(_classThis, "User");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _userId_decorators = [(0, typeorm_1.PrimaryColumn)('uuid', { name: 'user_id' })];
        _username_decorators = [(0, typeorm_1.Column)({ unique: true })];
        _email_decorators = [(0, typeorm_1.Column)({ unique: true })];
        _employeeId_decorators = [(0, typeorm_1.Column)({ name: 'employee_id', nullable: true })];
        _wmsuId_decorators = [(0, typeorm_1.Column)({ name: 'wmsu_id', nullable: true })];
        _role_decorators = [(0, typeorm_1.Column)({ type: 'enum', enum: ['administrator', 'college_dean', 'department_head', 'viewer'] })];
        _deptId_decorators = [(0, typeorm_1.Column)({ name: 'dept_id', type: 'bigint', nullable: true })];
        _facultyId_decorators = [(0, typeorm_1.Column)({ name: 'faculty_id', type: 'bigint', nullable: true })];
        _isActive_decorators = [(0, typeorm_1.Column)({ name: 'is_active', default: true })];
        _createdAt_decorators = [(0, typeorm_1.Column)({ name: 'created_at', type: 'timestamptz' })];
        _updatedAt_decorators = [(0, typeorm_1.Column)({ name: 'updated_at', type: 'timestamptz' })];
        __esDecorate(null, null, _userId_decorators, { kind: "field", name: "userId", static: false, private: false, access: { has: function (obj) { return "userId" in obj; }, get: function (obj) { return obj.userId; }, set: function (obj, value) { obj.userId = value; } }, metadata: _metadata }, _userId_initializers, _userId_extraInitializers);
        __esDecorate(null, null, _username_decorators, { kind: "field", name: "username", static: false, private: false, access: { has: function (obj) { return "username" in obj; }, get: function (obj) { return obj.username; }, set: function (obj, value) { obj.username = value; } }, metadata: _metadata }, _username_initializers, _username_extraInitializers);
        __esDecorate(null, null, _email_decorators, { kind: "field", name: "email", static: false, private: false, access: { has: function (obj) { return "email" in obj; }, get: function (obj) { return obj.email; }, set: function (obj, value) { obj.email = value; } }, metadata: _metadata }, _email_initializers, _email_extraInitializers);
        __esDecorate(null, null, _employeeId_decorators, { kind: "field", name: "employeeId", static: false, private: false, access: { has: function (obj) { return "employeeId" in obj; }, get: function (obj) { return obj.employeeId; }, set: function (obj, value) { obj.employeeId = value; } }, metadata: _metadata }, _employeeId_initializers, _employeeId_extraInitializers);
        __esDecorate(null, null, _wmsuId_decorators, { kind: "field", name: "wmsuId", static: false, private: false, access: { has: function (obj) { return "wmsuId" in obj; }, get: function (obj) { return obj.wmsuId; }, set: function (obj, value) { obj.wmsuId = value; } }, metadata: _metadata }, _wmsuId_initializers, _wmsuId_extraInitializers);
        __esDecorate(null, null, _role_decorators, { kind: "field", name: "role", static: false, private: false, access: { has: function (obj) { return "role" in obj; }, get: function (obj) { return obj.role; }, set: function (obj, value) { obj.role = value; } }, metadata: _metadata }, _role_initializers, _role_extraInitializers);
        __esDecorate(null, null, _deptId_decorators, { kind: "field", name: "deptId", static: false, private: false, access: { has: function (obj) { return "deptId" in obj; }, get: function (obj) { return obj.deptId; }, set: function (obj, value) { obj.deptId = value; } }, metadata: _metadata }, _deptId_initializers, _deptId_extraInitializers);
        __esDecorate(null, null, _facultyId_decorators, { kind: "field", name: "facultyId", static: false, private: false, access: { has: function (obj) { return "facultyId" in obj; }, get: function (obj) { return obj.facultyId; }, set: function (obj, value) { obj.facultyId = value; } }, metadata: _metadata }, _facultyId_initializers, _facultyId_extraInitializers);
        __esDecorate(null, null, _isActive_decorators, { kind: "field", name: "isActive", static: false, private: false, access: { has: function (obj) { return "isActive" in obj; }, get: function (obj) { return obj.isActive; }, set: function (obj, value) { obj.isActive = value; } }, metadata: _metadata }, _isActive_initializers, _isActive_extraInitializers);
        __esDecorate(null, null, _createdAt_decorators, { kind: "field", name: "createdAt", static: false, private: false, access: { has: function (obj) { return "createdAt" in obj; }, get: function (obj) { return obj.createdAt; }, set: function (obj, value) { obj.createdAt = value; } }, metadata: _metadata }, _createdAt_initializers, _createdAt_extraInitializers);
        __esDecorate(null, null, _updatedAt_decorators, { kind: "field", name: "updatedAt", static: false, private: false, access: { has: function (obj) { return "updatedAt" in obj; }, get: function (obj) { return obj.updatedAt; }, set: function (obj, value) { obj.updatedAt = value; } }, metadata: _metadata }, _updatedAt_initializers, _updatedAt_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        User = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return User = _classThis;
}();
exports.User = User;
