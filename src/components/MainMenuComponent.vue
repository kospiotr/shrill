<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <nav class="menu">
    <RouterLink to="/" class="brand">shrill</RouterLink>
    <div class="links">
      <RouterLink to="/">CLI</RouterLink>
      <RouterLink to="/upload">Upload</RouterLink>
      <RouterLink to="/files">Files</RouterLink>
    </div>
  </nav>
</template>

<style scoped>
.menu {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 0;
  border-bottom: 1px solid var(--color-border);
}

.brand {
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-heading);
  text-decoration: none;
}

.links {
  display: flex;
  gap: 1.25rem;
}

.links a {
  color: var(--color-text-muted);
  text-decoration: none;
  padding-bottom: 0.25rem;
  border-bottom: 2px solid transparent;
}

.links a:hover {
  color: var(--color-text);
}

.links a.router-link-active {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
}
</style>
