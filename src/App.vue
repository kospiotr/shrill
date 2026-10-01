<script setup lang="ts">
import { RouterView } from 'vue-router'
import MainMenuComponent from './components/MainMenuComponent.vue'
</script>

<template>
  <div class="shell">
    <MainMenuComponent />
    <main>
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.shell {
  width: 100%;
  max-width: 44rem;
  margin: 0 auto;
  padding: 0 1.25rem 3rem;
}

main {
  padding-top: 2rem;
}
</style>
