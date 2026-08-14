{{/*
Expand the name of the chart.
*/}}
{{- define "backend.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "backend.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "backend.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "backend.labels" -}}
helm.sh/chart: {{ include "backend.chart" . }}
{{ include "backend.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "backend.selectorLabels" -}}
app.kubernetes.io/name: {{ include "backend.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Component-scoped labels. The API and the consumer are separate Deployments
from one image, so every selector has to distinguish them - without the
component label the Service would happily route HTTP traffic to consumer
pods, which serve nothing.

Call as: {{ include "backend.componentSelectorLabels" (dict "ctx" . "component" "api") }}
*/}}
{{- define "backend.componentSelectorLabels" -}}
{{ include "backend.selectorLabels" .ctx }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{- define "backend.componentLabels" -}}
{{ include "backend.labels" .ctx }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{- define "backend.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "backend.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "backend.image" -}}
{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}
{{- end }}

{{/*
Environment shared by every workload in this chart - API, consumer and the
migration Job. Defined once so the three can never disagree about which
database or Redis they are talking to, which is exactly how the Compose
setup ended up with a worker pointed at a different database from the API.

Application secrets are NOT templated into the chart: they come from an
existing Secret, so they are never rendered into `helm get manifest`, a
values file, or CI logs. Populate it from Doppler with the External
Secrets Operator, or `kubectl create secret generic` for a one-off.
*/}}
{{- define "backend.env" -}}
- name: REDIS_HOST
  value: {{ .Values.redis.host | quote }}
- name: REDIS_PORT
  value: {{ .Values.redis.port | quote }}
{{- /* The app imports itself as backend.*, so the package's parent must be
       importable. Also set in the image; repeated here because a values
       override of `command` could otherwise lose it. */}}
- name: PYTHONPATH
  value: "/"
{{- with .Values.extraEnv }}
{{- toYaml . | nindent 0 }}
{{- end }}
{{- end }}

{{- define "backend.envFrom" -}}
- secretRef:
    name: {{ required "existingSecret is required - see values.yaml" .Values.existingSecret }}
{{- end }}

{{/*
Pod-level hardening, shared by all three workloads. The image already runs
as uid 1000 (see backend/Dockerfile); stating it here as well is what lets
the restricted Pod Security Standard admit these pods, since it validates
the manifest rather than the image.
*/}}
{{- define "backend.podSecurityContext" -}}
runAsNonRoot: true
runAsUser: 1000
runAsGroup: 1000
fsGroup: 1000
seccompProfile:
  type: RuntimeDefault
{{- end }}

{{- define "backend.containerSecurityContext" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop:
    - ALL
{{- end }}

{{/*
readOnlyRootFilesystem above means anything the process writes needs an
explicit volume. Two things do: the Doppler CLI's config dir, and the
optional log file (which degrades gracefully if unwritable, but an
emptyDir costs nothing and keeps the local behaviour).
*/}}
{{- define "backend.volumes" -}}
- name: tmp
  emptyDir: {}
- name: logs
  emptyDir: {}
{{- end }}

{{- define "backend.volumeMounts" -}}
- name: tmp
  mountPath: /tmp
- name: logs
  mountPath: /backend/.logs
{{- end }}
