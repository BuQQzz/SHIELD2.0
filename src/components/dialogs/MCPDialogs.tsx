/**
 * MCP Dialogs Component
 * 
 * Renders permission and write file dialogs for MCP operations
 */

import { PermissionDialog, type PermissionRequest } from "./PermissionDialog";
import { WriteFileDialog, type WriteFileRequest } from "./WriteFileDialog";

interface MCPDialogsProps {
  permissionRequest: PermissionRequest | null;
  writeFileRequest: WriteFileRequest | null;
  onPermissionApprove: (remember: boolean) => void;
  onPermissionDeny: () => void;
  onWriteFileApprove: (remember: boolean) => void;
  onWriteFileDeny: () => void;
}

export function MCPDialogs({
  permissionRequest,
  writeFileRequest,
  onPermissionApprove,
  onPermissionDeny,
  onWriteFileApprove,
  onWriteFileDeny,
}: MCPDialogsProps) {
  return (
    <>
      <PermissionDialog
        open={!!permissionRequest}
        request={permissionRequest}
        onApprove={onPermissionApprove}
        onDeny={onPermissionDeny}
      />

      <WriteFileDialog
        open={!!writeFileRequest}
        request={writeFileRequest}
        onApprove={onWriteFileApprove}
        onDeny={onWriteFileDeny}
      />
    </>
  );
}
