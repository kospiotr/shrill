<template>
  <div class="download-container">
    <h1>Download Page</h1>
    <form @submit.prevent="handleDownload" class="download-form">
      <input type="text" v-model="fileId" placeholder="Enter file ID" />
      <button type="submit">Get</button>
    </form>
    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    <p v-if="successMessage" class="success">{{ successMessage }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const fileId = ref<string>('')
const errorMessage = ref<string | null>(null)
const successMessage = ref<string | null>(null)

async function handleDownload() {
  errorMessage.value = null
  successMessage.value = null

  if (!fileId.value) {
    errorMessage.value = 'Please enter a file ID.'
    return
  }

  try {
    const response = await fetch(`/api/shrilldown?id=${fileId.value}`)
    if (response.status === 404) {
      errorMessage.value = 'File not found.'
    } else if (response.ok) {
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${fileId.value}.txt`
      a.click()
      window.URL.revokeObjectURL(url)
      successMessage.value = 'File found and downloaded successfully.'
    } else {
      errorMessage.value = 'An error occurred while downloading the file.'
    }
  } catch (error) {
    console.error('Error during download:', error)
    errorMessage.value = 'An unexpected error occurred.'
  }
}
</script>

<style scoped>
.download-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem;
}

.download-form {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

input {
  padding: 0.5rem;
  font-size: 1rem;
}

button {
  padding: 0.5rem 1rem;
  font-size: 1rem;
  cursor: pointer;
}

.error {
  color: red;
}

.success {
  color: green;
}
</style>
