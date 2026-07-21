// DocuGraph — universal CI/CD pipeline.
//
// Build ONCE here, push immutable images to a registry, deploy by PULLING them
// (see docker-compose.prod.yml + DEPLOY.md §9). Nothing is built on the prod host.
//
// Everything is parameterized — no hardcoded registry/URLs. Set the params on
// the job (or as global env with the same names). Requirements on the agent:
//   • Docker available (Docker Pipeline plugin) for building/pushing images.
//   • A Jenkins credential (username/password or token) for the registry.
//
// Tags pushed: <short-sha> always; :latest and the sanitized branch name when
// PUSH_LATEST is true.
pipeline {
  agent any

  parameters {
    string(name: 'REGISTRY', defaultValue: 'ghcr.io/your-org',
      description: 'Registry + namespace, e.g. ghcr.io/acme or registry.example.com/docugraph')
    string(name: 'REGISTRY_CREDENTIALS_ID', defaultValue: 'registry-credentials',
      description: 'Jenkins credentials ID (username/password or token) for the registry')
    string(name: 'NEXT_PUBLIC_API_URL', defaultValue: 'https://api.docs.example.com/api/v1',
      description: 'Public API URL baked into the frontend image at BUILD time (per environment)')
    booleanParam(name: 'RUN_E2E', defaultValue: true,
      description: 'Run backend e2e (in-memory Mongo) before building images')
    booleanParam(name: 'PUSH_LATEST', defaultValue: true,
      description: 'Also push :latest and the branch tag (in addition to the commit SHA)')
    string(name: 'DEPLOY_WEBHOOK', defaultValue: '',
      description: 'Optional: Portainer stack webhook URL to POST after a successful push (redeploy)')
  }

  environment {
    BACKEND_IMAGE  = "${params.REGISTRY}/docugraph-backend"
    FRONTEND_IMAGE = "${params.REGISTRY}/docugraph-frontend"
    REGISTRY_HOST  = "${params.REGISTRY.split('/')[0]}"
  }

  options {
    timestamps()
    disableConcurrentBuilds()
    timeout(time: 40, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '30'))
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        script {
          env.TAG = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
          def branch = env.BRANCH_NAME ?: sh(script: 'git rev-parse --abbrev-ref HEAD', returnStdout: true).trim()
          env.BRANCH_TAG = branch.replaceAll('[^A-Za-z0-9._-]', '-')
          echo "Building ${env.TAG} (branch ${env.BRANCH_TAG})"
        }
      }
    }

    // Test stages run inside a Node container so the agent needs no Node itself.
    stage('Backend — lint · test · build') {
      agent { docker { image 'node:20-bookworm'; reuseNode true } }
      steps {
        dir('backend') {
          sh 'npm ci'
          sh 'npm run lint'
          sh 'npm test'
          sh 'if [ "$RUN_E2E" = "true" ]; then npm run test:e2e; fi'
          sh 'npm run build'
        }
      }
    }

    stage('Frontend — lint · test · build') {
      agent { docker { image 'node:20-bookworm'; reuseNode true } }
      steps {
        dir('frontend') {
          sh 'npm ci'
          sh 'npm run lint'
          sh 'npm run typecheck'
          sh 'npm test -- --watchAll=false'
          sh 'npm run build'
        }
      }
    }

    stage('Build & push images') {
      steps {
        script {
          docker.withRegistry("https://${env.REGISTRY_HOST}", params.REGISTRY_CREDENTIALS_ID) {
            def backend = docker.build(
              "${env.BACKEND_IMAGE}:${env.TAG}",
              "--target prod ./backend")
            def frontend = docker.build(
              "${env.FRONTEND_IMAGE}:${env.TAG}",
              "--target prod --build-arg NEXT_PUBLIC_API_URL=${params.NEXT_PUBLIC_API_URL} ./frontend")

            backend.push()
            frontend.push()
            if (params.PUSH_LATEST) {
              backend.push('latest');  backend.push(env.BRANCH_TAG)
              frontend.push('latest'); frontend.push(env.BRANCH_TAG)
            }
          }
        }
      }
    }

    stage('Deploy (optional)') {
      when { expression { params.DEPLOY_WEBHOOK?.trim() } }
      steps {
        // Portainer per-stack webhook redeploys the stack (pulls the new images).
        sh 'curl -fsS -X POST "$DEPLOY_WEBHOOK"'
      }
    }
  }

  post {
    success { echo "Pushed ${env.BACKEND_IMAGE}:${env.TAG} and ${env.FRONTEND_IMAGE}:${env.TAG}" }
    always  { deleteDir() } // built-in; no Workspace Cleanup plugin required
  }
}
