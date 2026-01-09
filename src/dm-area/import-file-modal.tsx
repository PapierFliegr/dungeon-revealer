import * as React from "react";
import styled from "@emotion/styled/macro";
import graphql from "babel-plugin-relay/macro";
import { useMutation } from "relay-hooks";
import * as Button from "../button";
import { Modal } from "../modal";
import { useAsyncTask } from "../hooks/use-async-task";
import { sendRequest, ISendRequestTask } from "../http-request";
import { buildApiUrl } from "../public-url";
import { useAccessToken } from "../hooks/use-access-token";
import { LoadingSpinner } from "../loading-spinner";
import { generateSHA256FileHash } from "../crypto";
import { importFileModal_MapImageRequestUploadMutation } from "./__generated__/importFileModal_MapImageRequestUploadMutation.graphql";
import { importFileModal_MapCreateMutation } from "./__generated__/importFileModal_MapCreateMutation.graphql";

const OrSeperator = styled.span`
  padding-left: 18px;
  font-weight: bold;
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 0;
`;

const PreviewImage = styled.img`
  margin-left: auto;
  margin-right: auto;
  display: block;
  height: 50vh;
  width: auto;
`;

const FileTitle = styled.div`
  text-align: center;
  font-weight: bold;
  margin-top: 8px;
`;

const extractDefaultTitleFromFileName = (fileName: string) => {
  const parts = fileName.split(".");
  if (parts.length < 2) return fileName;
  parts.pop();
  return parts.join(".");
};

const validImageFileTypes = ["image/png", "image/jpeg"];

const ImportFileModal_MapImageRequestUploadMutation = graphql`
  mutation importFileModal_MapImageRequestUploadMutation(
    $input: MapImageRequestUploadInput!
  ) {
    mapImageRequestUpload(input: $input) {
      id
      uploadUrl
    }
  }
`;

const ImportFileModal_MapCreateMutation = graphql`
  mutation importFileModal_MapCreateMutation($input: MapCreateInput!) {
    mapCreate(input: $input) {
      ... on MapCreateSuccess {
        __typename
        createdMap {
          id
          title
          mapImageUrl
        }
      }
      ... on MapCreateError {
        __typename
        reason
      }
    }
  }
`;

const ImageImportModal: React.FC<{
  file: File;
  close: () => void;
}> = ({ file, close }) => {
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null);
  const accessToken = useAccessToken();

  const [mapImageRequestUpload] =
    useMutation<importFileModal_MapImageRequestUploadMutation>(
      ImportFileModal_MapImageRequestUploadMutation
    );
  const [mapCreate] = useMutation<importFileModal_MapCreateMutation>(
    ImportFileModal_MapCreateMutation
  );

  React.useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setObjectUrl(objectUrl);

    return () => {
      setObjectUrl(null);
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  const fileTitleWithoutExtension = React.useMemo(
    () => extractDefaultTitleFromFileName(file.name),
    [file]
  );

  const [isCreatingMap, onClickCreateMap] = useAsyncTask(
    React.useCallback(async () => {
      const hash = await generateSHA256FileHash(file);
      // 1. request file upload
      const result = await mapImageRequestUpload({
        variables: {
          input: {
            sha256: hash,
            extension: file.name.split(".").pop() ?? "",
          },
        },
      });

      // 2. upload file
      const uploadResponse = await fetch(
        result.mapImageRequestUpload.uploadUrl,
        {
          method: "PUT",
          body: file,
        }
      );

      if (uploadResponse.status !== 200) {
        const body = await uploadResponse.text();
        throw new Error(
          "Received invalid response code: " +
            uploadResponse.status +
            "\n\n" +
            body
        );
      }

      // 3. create map
      await mapCreate({
        variables: {
          input: {
            title: file.name,
            mapImageUploadId: result.mapImageRequestUpload.id,
          },
        },
        onCompleted: () => {
          close();
        },
      });
    }, [file, fileTitleWithoutExtension, close])
  );

  const [isImportingMediaLibraryItem, onClickImportMediaLibraryItem] =
    useAsyncTask(
      React.useCallback(async () => {
        const formData = new FormData();
        formData.append("file", file);

        const task = sendRequest({
          url: buildApiUrl("/images"),
          method: "POST",
          body: formData,
          headers: {
            Authorization: accessToken ? `Bearer ${accessToken}` : null,
          },
        });

        await task.done;
        close();
      }, [file, close, accessToken])
    );

  const areButtonsDisabled = isImportingMediaLibraryItem || isCreatingMap;

  return (
    <Modal onPressEscape={close} onClickOutside={close}>
      <Modal.Dialog>
        <Modal.Header>
          <h3>Import Image</h3>
        </Modal.Header>
        <Modal.Body>
          {objectUrl ? <PreviewImage src={objectUrl} /> : null}
          <FileTitle>{fileTitleWithoutExtension}</FileTitle>
        </Modal.Body>
        <Modal.Footer>
          <Modal.Actions>
            <Modal.ActionGroup>
              <Button.Tertiary tabIndex={1} onClick={close}>
                Close
              </Button.Tertiary>
            </Modal.ActionGroup>
            <Modal.ActionGroup>
              <div>
                <Button.Primary
                  disabled={areButtonsDisabled}
                  onClick={onClickImportMediaLibraryItem}
                >
                  Import into Media Library
                </Button.Primary>
              </div>
              <OrSeperator>or</OrSeperator>
              <div>
                <Button.Primary
                  disabled={areButtonsDisabled}
                  onClick={onClickCreateMap}
                >
                  Create Map
                </Button.Primary>
              </div>
            </Modal.ActionGroup>
          </Modal.Actions>
        </Modal.Footer>
      </Modal.Dialog>
    </Modal>
  );
};

export const ImportFileModal: React.FC<{
  file: File;
  close: () => void;
}> = ({ file, close }) => {
  if (validImageFileTypes.includes(file.type)) {
    return <ImageImportModal file={file} close={close} />;
  } else {
    return (
      <Modal onPressEscape={close} onClickOutside={close}>
        <Modal.Dialog>
          <Modal.Header>
            <h3>Invalid File</h3>
          </Modal.Header>
          <Modal.Body>
            Only images can be imported into Dungeon Revealer.
          </Modal.Body>
          <Modal.Footer>
            <Modal.Actions>
              <Modal.ActionGroup>
                <div>
                  <Button.Primary tabIndex={1} onClick={close}>
                    Ok
                  </Button.Primary>
                </div>
              </Modal.ActionGroup>
            </Modal.Actions>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal>
    );
  }
};
