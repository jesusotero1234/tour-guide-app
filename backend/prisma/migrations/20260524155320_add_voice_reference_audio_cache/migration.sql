-- AlterTable
ALTER TABLE "voice_reference_audio" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- RenameIndex
ALTER INDEX "voice_reference_audio_identity_unique" RENAME TO "voice_reference_audio_language_provider_model_voice_profile_key";
