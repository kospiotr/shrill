<template>
  <div class="upload-container">
    <form @submit.prevent="handleUpload" class="upload-form">
      <input type="file" id="file" @change="onFileChange" />
      <button type="submit">Send</button>
    </form>
    <p v-if="uploadId">Upload ID: {{ uploadId }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const selectedFile = ref<File | null>(null)
const uploadId = ref<string | null>(null)

function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  selectedFile.value = target.files ? target.files[0] : null
}

async function handleUpload() {
  if (selectedFile.value) {
    const reader = new FileReader();
    reader.onload = async () => {
      if (reader.result && typeof reader.result === 'string') {
        const base64Content = btoa(reader.result);
        const chunks = base64Content.match(/.{1,7000}/g) || [];
        const id = crypto.randomUUID(); // Generate a unique ID for the upload
        uploadId.value = id; // Set the upload ID to display it

        try {
          await Promise.all(
            chunks.map((chunk, index) =>
              fetch(`/api/shrillup?id=${id}&index=${index}&chunk=${encodeURIComponent(chunk)}`, {
                method: 'GET',
              })
            )
          );
          console.log('All chunks uploaded successfully');
        } catch (error) {
          console.error('Error uploading chunks:', error);
        }
      }
    };
    reader.onerror = () => {
      console.error('Error reading file');
    };
    reader.readAsBinaryString(selectedFile.value);
  } else {
    console.log('No file selected');
  }
}
</script>

<style scoped>
.upload-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
}

.upload-form {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}
</style>
