/**
 * Tests for Universal Multi-Language AST Analyzers.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ast = require('../gsd-core/bin/lib/codebase-ast-analyzer.cjs');
const { analyzeSourceFile } = ast;

describe('Universal Multi-Language AST Analyzers', () => {
  test('analyzes Python files (.py)', () => {
    const code = `
import os
from fastapi import FastAPI, APIRouter
from .services import AuthService

app = FastAPI()
router = APIRouter()

class UserModel:
    def __init__(self, name):
        self.name = name

@router.get("/users")
async def get_users():
    return []

@app.post("/login")
def login():
    pass
`;
    const res = analyzeSourceFile('app/main.py', code);
    assert.strictEqual(res.language, 'python');
    assert.ok(res.symbols.some(s => s.name === 'UserModel' && s.kind === 'class'));
    assert.ok(res.symbols.some(s => s.name === 'get_users' && s.kind === 'function'));
    assert.ok(res.routes.some(r => r.method === 'GET' && r.path === '/users'));
    assert.ok(res.routes.some(r => r.method === 'POST' && r.path === '/login'));
    assert.ok(res.localDeps.includes('.services'));
  });

  test('analyzes Go files (.go)', () => {
    const code = `
package main

import (
  "fmt"
  "github.com/gin-gonic/gin"
)

type User struct {
  ID int
}

type UserRepository interface {
  FindByID(id int) (*User, error)
}

func HandleUser(c *gin.Context) {
  fmt.Println("User")
}

func main() {
  r := gin.Default()
  r.GET("/api/users", HandleUser)
}
`;
    const res = analyzeSourceFile('main.go', code);
    assert.strictEqual(res.language, 'go');
    assert.ok(res.symbols.some(s => s.name === 'User' && s.kind === 'struct'));
    assert.ok(res.symbols.some(s => s.name === 'UserRepository' && s.kind === 'interface'));
    assert.ok(res.symbols.some(s => s.name === 'HandleUser' && s.kind === 'function'));
    assert.ok(res.routes.some(r => r.method === 'GET' && r.path === '/api/users'));
  });

  test('analyzes Rust files (.rs)', () => {
    const code = `
use axum::{routing::get, Router};
use crate::models::User;

pub struct UserService;

pub trait Repository {
    fn find(&self) -> Option<User>;
}

pub async fn root() -> &'static str {
    "Hello"
}
`;
    const res = analyzeSourceFile('src/lib.rs', code);
    assert.strictEqual(res.language, 'rust');
    assert.ok(res.symbols.some(s => s.name === 'UserService' && s.kind === 'struct'));
    assert.ok(res.symbols.some(s => s.name === 'Repository' && s.kind === 'trait'));
    assert.ok(res.symbols.some(s => s.name === 'root' && s.kind === 'function'));
    assert.ok(res.localDeps.includes('crate::models::User'));
  });

  test('analyzes Flutter / Dart files (.dart)', () => {
    const code = `
import 'package:flutter/material.dart';
import './user_card.dart';

class UserProfileScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container();
  }
}

enum ScreenState { loading, ready, error }
`;
    const res = analyzeSourceFile('lib/screens/profile.dart', code);
    assert.strictEqual(res.language, 'dart');
    assert.ok(res.symbols.some(s => s.name === 'UserProfileScreen' && s.kind === 'widget'));
    assert.ok(res.symbols.some(s => s.name === 'ScreenState' && s.kind === 'enum'));
    assert.ok(res.localDeps.includes('./user_card.dart'));
    assert.ok(res.externalDeps.includes('flutter'));
  });

  test('analyzes C# / .NET files (.cs)', () => {
    const code = `
using System.Collections.Generic;
using Microsoft.AspNetCore.Mvc;

namespace App.Controllers;

public interface IUserService {
    User GetUser(int id);
}

[ApiController]
[Route("api/[controller]")]
public class UserController : ControllerBase {
    [HttpGet("{id}")]
    public IActionResult GetById(int id) => Ok();

    [HttpPost]
    public IActionResult CreateUser() => Ok();
}
`;
    const res = analyzeSourceFile('Controllers/UserController.cs', code);
    assert.strictEqual(res.language, 'csharp');
    assert.ok(res.symbols.some(s => s.name === 'IUserService' && s.kind === 'interface'));
    assert.ok(res.symbols.some(s => s.name === 'UserController' && s.kind === 'class'));
    assert.ok(res.routes.some(r => r.method === 'GET'));
    assert.ok(res.routes.some(r => r.method === 'POST'));
  });

  test('analyzes Java & Kotlin files (.java, .kt)', () => {
    const javaCode = `
package com.example.demo;
import org.springframework.web.bind.annotation.GetMapping;

public class OrderController {
    @GetMapping("/orders")
    public List<Order> getOrders() { return null; }
}
`;
    const resJava = analyzeSourceFile('src/main/java/OrderController.java', javaCode);
    assert.strictEqual(resJava.language, 'java');
    assert.ok(resJava.symbols.some(s => s.name === 'OrderController' && s.kind === 'class'));
    assert.ok(resJava.routes.some(r => r.method === 'GET' && r.path === '/orders'));

    const ktCode = `
package com.example.demo
data class Customer(val id: String, val name: String)
`;
    const resKt = analyzeSourceFile('src/main/kotlin/Customer.kt', ktCode);
    assert.strictEqual(resKt.language, 'kotlin');
    assert.ok(resKt.symbols.some(s => s.name === 'Customer' && s.kind === 'class'));
  });

  test('analyzes PHP and Ruby files (.php, .rb)', () => {
    const phpCode = `
<?php
namespace App\\Controllers;
use App\\Models\\User;

class AuthController {
    public function login() {}
}

Route::post('/auth/login', [AuthController::class, 'login']);
`;
    const resPhp = analyzeSourceFile('app/Controllers/AuthController.php', phpCode);
    assert.strictEqual(resPhp.language, 'php');
    assert.ok(resPhp.symbols.some(s => s.name === 'AuthController' && s.kind === 'class'));
    assert.ok(resPhp.routes.some(r => r.method === 'POST' && r.path === '/auth/login'));

    const rbCode = `
require 'jwt'
require_relative 'base_controller'

class ProductsController < BaseController
  def index
  end
end

get '/products', to: 'products#index'
`;
    const resRb = analyzeSourceFile('app/controllers/products_controller.rb', rbCode);
    assert.strictEqual(resRb.language, 'ruby');
    assert.ok(resRb.symbols.some(s => s.name === 'ProductsController' && s.kind === 'class'));
    assert.ok(resRb.symbols.some(s => s.name === 'index' && s.kind === 'function'));
    assert.ok(resRb.routes.some(r => r.method === 'GET' && r.path === '/products'));
  });

  test('analyzes SQL DDL files with inline comments (.sql)', () => {
    const code = `
CREATE TABLE IF NOT EXISTS users ( /* audit comment */
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE VIEW active_users AS /* inline view comment */
SELECT * FROM users WHERE active = 1;
`;
    const res = analyzeSourceFile('schema.sql', code);
    assert.strictEqual(res.language, 'sql');
    assert.ok(res.symbols.some(s => s.name === 'users' && s.kind === 'table'));
    assert.ok(res.symbols.some(s => s.name === 'active_users' && s.kind === 'function'));
  });

  test('disambiguates Prisma vs GraphQL (.prisma vs .graphql)', () => {
    const prismaCode = `
datasource db {
  provider = "postgresql"
}

model User {
  id Int @id @default(autoincrement())
}

enum Role {
  USER
  ADMIN
}

type Address {
  street String
}
`;
    const resPrisma = analyzeSourceFile('prisma/schema.prisma', prismaCode);
    assert.strictEqual(resPrisma.language, 'prisma');
    assert.strictEqual(resPrisma.symbols.filter(s => s.name === 'Address').length, 1);
    assert.ok(resPrisma.symbols.some(s => s.name === 'User' && s.kind === 'model'));

    const gqlCode = `
type Query {
  user(id: ID!): User
}

type Address {
  street: String!
}
`;
    const resGql = analyzeSourceFile('schema.graphql', gqlCode);
    assert.strictEqual(resGql.language, 'graphql');
    assert.strictEqual(resGql.symbols.filter(s => s.name === 'Address').length, 1);
    assert.ok(resGql.symbols.some(s => s.name === 'Address' && s.kind === 'interface'));
  });

  test('analyzes CSS / SCSS and Design Tokens (.css, .scss)', () => {
    const code = `
@import './variables.css';

// SCSS single line comment: --ignore-me: 1px;
:root {
  --primary-color: #3b82f6;
  --spacing-md: 16px;
}

.btn-primary {
  background-color: var(--primary-color);
}

@keyframes slideIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
`;
    const res = analyzeSourceFile('styles/theme.scss', code);
    assert.strictEqual(res.language, 'css');
    assert.ok(res.symbols.some(s => s.name === '--primary-color' && s.kind === 'token'));
    assert.ok(!res.symbols.some(s => s.name === '--ignore-me'));
    assert.ok(res.symbols.some(s => s.name === '.btn-primary' && s.kind === 'token'));
    assert.ok(res.symbols.some(s => s.name === '@keyframes slideIn'));
    assert.ok(res.localDeps.includes('./variables.css'));
  });

  test('analyzes Docker and Shell files (Dockerfile, docker-compose.yml, .sh)', () => {
    const dockerfile = `
FROM node:20-alpine
EXPOSE 3000
CMD ["npm", "start"]
`;
    const resDocker = analyzeSourceFile('Dockerfile', dockerfile);
    assert.strictEqual(resDocker.language, 'docker');
    assert.ok(resDocker.symbols.some(s => s.name === 'image:node:20-alpine'));
    assert.ok(resDocker.symbols.some(s => s.name === 'port:3000'));

    const compose = `
services:
  database:
    image: postgres:16
    ports:
      - "5432:5432"
  api:
    build: .
    ports:
      - "3000:3000"
`;
    const resCompose = analyzeSourceFile('docker-compose.yml', compose);
    assert.strictEqual(resCompose.language, 'docker');
    assert.ok(resCompose.symbols.some(s => s.name === 'service:database'));
    assert.ok(resCompose.symbols.some(s => s.name === 'service:api'));

    const shell = `
#!/bin/bash
source ./config.sh
export PORT=8080

function deploy_app() {
  echo "Deploying..."
}
`;
    const resShell = analyzeSourceFile('deploy.sh', shell);
    assert.strictEqual(resShell.language, 'shell');
    assert.ok(resShell.symbols.some(s => s.name === 'deploy_app' && s.kind === 'function'));
    assert.ok(resShell.symbols.some(s => s.name === 'PORT' && s.kind === 'token'));
    assert.ok(resShell.localDeps.includes('./config.sh'));
  });
});
