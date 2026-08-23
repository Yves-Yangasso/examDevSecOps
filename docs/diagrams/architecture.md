# Diagrammes — architecture et chaîne de valeur

## 1. Architecture cible

```mermaid
flowchart LR
    subgraph client["Poste utilisateur"]
        U["Utilisateur<br/>navigateur"]
    end

    subgraph edge["Périmètre"]
        ING["Ingress NGINX<br/>TLS / HSTS / rate-limit"]
    end

    subgraph run["Cluster d'exécution"]
        FE["Frontend conteneurisé<br/>nginx-unprivileged UID 101<br/>rootfs lecture seule"]
        CAN["Canari 10 %<br/>même image, nouvelle version"]
        OTELC["Collecteur OpenTelemetry<br/>purge + échantillonnage"]
    end

    subgraph ext["Services externes"]
        API["API Fake Store<br/>/auth/login · /products"]
    end

    subgraph obs["Observabilité"]
        PROM["Prometheus<br/>métriques + alertes"]
        LOKI["Loki<br/>logs JSON"]
        TEMPO["Tempo<br/>traces"]
        GRAF["Grafana<br/>dashboards + SLO"]
    end

    subgraph sup["Chaîne d'approvisionnement"]
        GH["GitHub Actions<br/>CI/CD"]
        HUB["Docker Hub<br/>bao236/examdevsecops"]
        SIG["Cosign / Rekor<br/>signature + SBOM"]
    end

    U -->|HTTPS| ING
    ING --> FE
    ING -.->|10 % du trafic| CAN
    U -->|"XHR directe (CORS)"| API
    FE -->|"traces OTLP/HTTP"| OTELC

    OTELC --> TEMPO
    FE -->|logs stdout JSON| LOKI
    FE -->|/nginx_status| PROM
    PROM --> GRAF
    LOKI --> GRAF
    TEMPO --> GRAF
    PROM -->|alertes| GRAF

    GH -->|push image signée| HUB
    GH --> SIG
    HUB -->|pull vérifié Cosign| FE
    GH -->|annotation de déploiement| GRAF
```

**Points de lecture.**

- Le navigateur appelle l'API Fake Store **directement**. C'est une contrainte du
  sujet (API publique tierce), pas un choix : elle impose que le jeton transite par
  le navigateur. La cible corrigée est décrite au §10 du rapport (BFF).
- Le frontend n'a **qu'une seule sortie réseau autorisée** : le collecteur OTel.
  Tout le reste est refusé par la `NetworkPolicy` de refus par défaut.
- Le registre n'est jamais consommé sans vérification : le job `verify-artifact`
  refuse une image dont la signature Cosign n'est pas valide.

---

## 2. Chaîne de valeur — du commit au feedback de production

```mermaid
flowchart TD
    A["Développeur<br/>commit local"] --> B["Hook pre-commit<br/>gitleaks · eslint · tsc<br/>~20 s"]
    B --> C["Pull request"]

    C --> D1["Qualité<br/>lint · types · format<br/>~2 min"]
    C --> D2["Secrets<br/>Gitleaks historique complet"]

    D1 --> E1["Tests unitaires<br/>Vitest + seuils 85 %"]
    D1 --> E2["SAST<br/>Semgrep + OWASP Top 10"]
    D1 --> E3["SCA<br/>OSV-Scanner + npm audit"]

    E1 --> F["Build image<br/>multi-stage · digests épinglés"]
    E2 --> F
    E3 --> F
    D2 --> F

    F --> G1["SBOM CycloneDX<br/>Syft"]
    F --> G2["Scan image<br/>Trivy HIGH/CRITICAL"]
    F --> G3["Dockle<br/>bonnes pratiques"]
    F --> G4["Signature Cosign<br/>keyless OIDC + Rekor"]

    G2 --> H1["E2E Playwright<br/>sur le conteneur réel"]
    G2 --> H2["DAST ZAP baseline"]

    H1 --> I{"Porte de qualité"}
    H2 --> I
    G1 --> I
    G3 --> I
    G4 --> I

    I -->|échec| X["Fusion bloquée<br/>retour au développeur"]
    I -->|succès| J["Fusion sur main"]

    J --> K["Vérification signature<br/>avant tout déploiement"]
    K --> L["Staging<br/>automatique"]
    L --> M["Smoke tests"]
    M --> N{"Validation humaine<br/>environnement protégé"}
    N --> O["Canari 10 %<br/>production"]
    O --> P["Observation 5 min<br/>requête Prometheus"]
    P -->|taux 5xx > 2 %| R["Retour arrière<br/>automatique"]
    P -->|nominal| Q["Promotion 100 %"]
    Q --> S["Annotation Grafana<br/>+ métriques DORA"]
    S --> T["Feedback production<br/>RUM · logs · traces · alertes"]
    T -.->|boucle d'amélioration| A

    style X fill:#fee,stroke:#b3261e
    style R fill:#fee,stroke:#b3261e
    style Q fill:#efe,stroke:#1e7a3c
    style T fill:#eef,stroke:#2f5bea
```

---

## 3. Où intervient chaque contrôle de sécurité

```mermaid
flowchart LR
    subgraph P1["Code"]
        S1["Gitleaks<br/>secrets"]
        S2["ESLint security<br/>+ règles Semgrep maison"]
    end
    subgraph P2["Dépendances"]
        S3["OSV-Scanner"]
        S4["npm audit --omit=dev"]
        S5["Dependabot hebdomadaire"]
    end
    subgraph P3["Artefact"]
        S6["Trivy image"]
        S7["Dockle"]
        S8["SBOM CycloneDX"]
        S9["Cosign + Rekor"]
    end
    subgraph P4["Exécution"]
        S10["ZAP baseline"]
        S11["CSP + en-têtes<br/>testés en E2E"]
        S12["rootfs RO · non-root<br/>cap-drop ALL"]
        S13["NetworkPolicy<br/>refus par défaut"]
    end
    subgraph P5["Après livraison"]
        S14["Re-scan quotidien<br/>de l'image en production"]
        S15["Expiration forcée<br/>des dérogations"]
    end

    P1 --> P2 --> P3 --> P4 --> P5
    P5 -.->|nouvelle CVE → ticket| P1
```

Le coût de correction d'un défaut croît d'un ordre de grandeur à chaque étage
franchi. C'est la seule justification du « shift left » : ce n'est pas
d'attraper *plus* de défauts, c'est de les attraper *moins cher*.
