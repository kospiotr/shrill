<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="menu">
    <RouterLink to="/upload" class="button">Upload</RouterLink>
    <RouterLink to="/download" class="button">Download</RouterLink>
  </div>
</template>

<style scoped>
.menu {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  min-width: 100%;
}

.button {
  background-color: hsla(160, 100%, 37%, 1);
  color: var(--color-background);
  border: 0;
  padding: 0.75rem 1.5rem;
  border-radius: 0.25rem;
  cursor: pointer;
  margin: 1rem 0;
  text-decoration: none;
  font-size: 1.25rem;
}

.button:hover {
  background-color: hsla(160, 100%, 45%, 1);
}
</style>

