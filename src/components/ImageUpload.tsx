"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, X } from "lucide-react";
import toast from "react-hot-toast";
interface Props {
  label: string;
  value: string;
  onChange: (url: string) => void;
  onFileChange?: (file: File | null) => void;
  aspect?: "square" | "banner";
}
export default function ImageUpload({
  label,
  value,
  onChange,
  onFileChange,
}: Props) {
  const [name, setName] = useState("");
  const preview = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (preview.current) URL.revokeObjectURL(preview.current);
    },
    [],
  );
  const onDrop = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) return;
      if (preview.current) URL.revokeObjectURL(preview.current);
      const url = URL.createObjectURL(file);
      preview.current = url;
      setName(file.name);
      onFileChange?.(file);
      onChange(url);
    },
    [onChange, onFileChange],
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"] },
    maxSize: 4 * 1024 * 1024,
    maxFiles: 1,
    onDropRejected: () => toast.error("Choose one PNG or JPG image under 4MB."),
  });
  const remove = () => {
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = null;
    setName("");
    onFileChange?.(null);
    onChange("");
  };
  return (
    <div>
      {label && <label>{label}</label>}
      <div
        {...getRootProps()}
        className={"upload-zone " + (isDragActive ? "drag-active" : "")}
        aria-label="Upload token image"
      >
        <input {...getInputProps()} aria-label="Token image file" />
        {value ? (
          <>
            <img src={value} alt="Token preview" className="upload-preview" />
            <p className="upload-name">{name || "Token image"}</p>
            <small>Click or drag to replace</small>
            <button
              type="button"
              className="upload-remove"
              aria-label="Remove image"
              onClick={(e) => {
                e.stopPropagation();
                remove();
              }}
            >
              <X size={16} />
            </button>
          </>
        ) : (
          <>
            <div className="upload-icon">
              <UploadCloud size={24} />
            </div>
            <p>Click to upload or drag and drop</p>
            <small>PNG or JPG. Max 4MB.</small>
          </>
        )}
      </div>
    </div>
  );
}
