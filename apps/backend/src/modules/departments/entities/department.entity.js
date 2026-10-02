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
exports.Department = void 0;
var typeorm_1 = require("typeorm");
var Department = function () {
    var _classDecorators = [(0, typeorm_1.Entity)('department')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _deptId_decorators;
    var _deptId_initializers = [];
    var _deptId_extraInitializers = [];
    var _deptCode_decorators;
    var _deptCode_initializers = [];
    var _deptCode_extraInitializers = [];
    var _deptName_decorators;
    var _deptName_initializers = [];
    var _deptName_extraInitializers = [];
    var _description_decorators;
    var _description_initializers = [];
    var _description_extraInitializers = [];
    var _isActive_decorators;
    var _isActive_initializers = [];
    var _isActive_extraInitializers = [];
    var Department = _classThis = /** @class */ (function () {
        function Department_1() {
            this.deptId = __runInitializers(this, _deptId_initializers, void 0);
            this.deptCode = (__runInitializers(this, _deptId_extraInitializers), __runInitializers(this, _deptCode_initializers, void 0));
            this.deptName = (__runInitializers(this, _deptCode_extraInitializers), __runInitializers(this, _deptName_initializers, void 0));
            this.description = (__runInitializers(this, _deptName_extraInitializers), __runInitializers(this, _description_initializers, void 0));
            this.isActive = (__runInitializers(this, _description_extraInitializers), __runInitializers(this, _isActive_initializers, void 0));
            __runInitializers(this, _isActive_extraInitializers);
        }
        return Department_1;
    }());
    __setFunctionName(_classThis, "Department");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _deptId_decorators = [(0, typeorm_1.PrimaryGeneratedColumn)('identity', { name: 'dept_id', type: 'bigint' })];
        _deptCode_decorators = [(0, typeorm_1.Column)({ name: 'dept_code', unique: true })];
        _deptName_decorators = [(0, typeorm_1.Column)({ name: 'dept_name' })];
        _description_decorators = [(0, typeorm_1.Column)({ nullable: true })];
        _isActive_decorators = [(0, typeorm_1.Column)({ name: 'is_active', default: true })];
        __esDecorate(null, null, _deptId_decorators, { kind: "field", name: "deptId", static: false, private: false, access: { has: function (obj) { return "deptId" in obj; }, get: function (obj) { return obj.deptId; }, set: function (obj, value) { obj.deptId = value; } }, metadata: _metadata }, _deptId_initializers, _deptId_extraInitializers);
        __esDecorate(null, null, _deptCode_decorators, { kind: "field", name: "deptCode", static: false, private: false, access: { has: function (obj) { return "deptCode" in obj; }, get: function (obj) { return obj.deptCode; }, set: function (obj, value) { obj.deptCode = value; } }, metadata: _metadata }, _deptCode_initializers, _deptCode_extraInitializers);
        __esDecorate(null, null, _deptName_decorators, { kind: "field", name: "deptName", static: false, private: false, access: { has: function (obj) { return "deptName" in obj; }, get: function (obj) { return obj.deptName; }, set: function (obj, value) { obj.deptName = value; } }, metadata: _metadata }, _deptName_initializers, _deptName_extraInitializers);
        __esDecorate(null, null, _description_decorators, { kind: "field", name: "description", static: false, private: false, access: { has: function (obj) { return "description" in obj; }, get: function (obj) { return obj.description; }, set: function (obj, value) { obj.description = value; } }, metadata: _metadata }, _description_initializers, _description_extraInitializers);
        __esDecorate(null, null, _isActive_decorators, { kind: "field", name: "isActive", static: false, private: false, access: { has: function (obj) { return "isActive" in obj; }, get: function (obj) { return obj.isActive; }, set: function (obj, value) { obj.isActive = value; } }, metadata: _metadata }, _isActive_initializers, _isActive_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        Department = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return Department = _classThis;
}();
exports.Department = Department;
