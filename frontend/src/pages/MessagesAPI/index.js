import React, { useState, useContext, useEffect } from "react";
import axios from "axios";
import api from "../../services/api";
import { AuthContext } from "../../context/Auth/AuthContext";
import { v4 as uuidv4 } from "uuid";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";

import { i18n } from "../../translate/i18n";
import { Button, CircularProgress, Grid, TextField, Typography } from "@material-ui/core";
import { Field, Form, Formik } from "formik";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";
import { getBackendURL } from "../../services/config";

const useStyles = makeStyles((theme) => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(2),
    paddingBottom: 100
  },
  mainHeader: {
    marginTop: theme.spacing(1),
  },
  elementMargin: {
    marginTop: theme.spacing(2),
  },
  formContainer: {
    maxWidth: 500,
  },
  textRight: {
    textAlign: "right"
  }
}));

const MessagesAPI = () => {
  const classes = useStyles();

  const { user } = useContext(AuthContext);
  const [companyAccess, setCompanyAccess] = useState({ apiAccessToken: "", apiSecretToken: "" });

  const [formMessageTextData,] = useState({ token: '', number: '', body: '' })
  const [formMessageMediaData,] = useState({ token: '', number: '', medias: '' })
  const [file, setFile] = useState({})

  useEffect(() => {
    const fetchCompany = async () => {
      try {
        const { data } = await api.get(`/companies/${user.companyId}`);
        setCompanyAccess({
          apiAccessToken: data.apiAccessToken || "",
          apiSecretToken: data.apiSecretToken || ""
        });
      } catch (err) {
        toastError(err);
      }
    };
    if (user?.companyId) {
      fetchCompany();
    }
  }, [user]);

  const handleGenerateTokens = async () => {
    try {
      const newTokenAccess = uuidv4();
      const newSecretAccess = uuidv4();
      await api.put(`/companies/${user.companyId}`, {
        apiAccessToken: newTokenAccess,
        apiSecretToken: newSecretAccess
      });
      setCompanyAccess({ apiAccessToken: newTokenAccess, apiSecretToken: newSecretAccess });
      toast.success("Tokens gerados com sucesso!");
    } catch (err) {
      toastError(err);
    }
  };

  const getEndpoint = () => {
    return getBackendURL() + '/api/messages/send'
  }

  const getStartConversationEndpoint = () => {
    return getBackendURL() + '/api/tickets/start'
  }

  const handleSendTextMessage = async (values) => {
    const { number, body } = values;
    const data = { number, body };
    var options = {
      method: 'POST',
      url: `${getBackendURL()}/api/messages/send`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${values.token}`
      },
      data
    };

    axios.request(options).then(function (response) {
      toast.success('Mensagem enviada com sucesso');
    }).catch(function (error) {
      toastError(error);
    });
  }

  const handleSendMediaMessage = async (values) => {
    try {
      const firstFile = file[0];
      const data = new FormData();
      data.append('number', values.number);
      data.append('body', firstFile.name);
      data.append('medias', firstFile);
      var options = {
        method: 'POST',
        url: `${getBackendURL()}/api/messages/send`,
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${values.token}`
        },
        data
      };

      axios.request(options).then(function (response) {
        toast.success('Mensagem enviada com sucesso');
      }).catch(function (error) {
        toastError(error);
      });
    } catch (err) {
      toastError(err);
    }
  }

  const renderFormMessageText = () => {
    return (
      <Formik
        initialValues={formMessageTextData}
        enableReinitialize={true}
        onSubmit={(values, actions) => {
          setTimeout(async () => {
            await handleSendTextMessage(values);
            actions.setSubmitting(false);
            actions.resetForm()
          }, 400);
        }}
        className={classes.elementMargin}
      >
        {({ isSubmitting }) => (
          <Form className={classes.formContainer}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  label={i18n.t("messagesAPI.textMessage.token")}
                  name="token"
                  autoFocus
                  variant="outlined"
                  margin="dense"
                  fullWidth
                  className={classes.textField}
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  label={i18n.t("messagesAPI.textMessage.number")}
                  name="number"
                  autoFocus
                  variant="outlined"
                  margin="dense"
                  fullWidth
                  className={classes.textField}
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <Field
                  as={TextField}
                  label={i18n.t("messagesAPI.textMessage.body")}
                  name="body"
                  autoFocus
                  variant="outlined"
                  margin="dense"
                  fullWidth
                  className={classes.textField}
                  required
                />
              </Grid>
              <Grid item xs={12} className={classes.textRight}>
                <Button
                  type="submit"
                  color="primary"
                  variant="contained"
                  className={classes.btnWrapper}
                >
                  {isSubmitting ? (
                    <CircularProgress
                      size={24}
                      className={classes.buttonProgress}
                    />
                  ) : 'Enviar'}
                </Button>
              </Grid>
            </Grid>
          </Form>
        )}
      </Formik>
    )
  }

  const renderFormMessageMedia = () => {
    return (
      <Formik
        initialValues={formMessageMediaData}
        enableReinitialize={true}
        onSubmit={(values, actions) => {
          setTimeout(async () => {

            await handleSendMediaMessage(values);
            actions.setSubmitting(false);
            actions.resetForm()
            document.getElementById('medias').files = null
            document.getElementById('medias').value = null
          }, 400);
        }}
        className={classes.elementMargin}
      >
        {({ isSubmitting }) => (
          <Form className={classes.formContainer}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  label={i18n.t("messagesAPI.mediaMessage.token")}
                  name="token"
                  autoFocus
                  variant="outlined"
                  margin="dense"
                  fullWidth
                  className={classes.textField}
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  label={i18n.t("messagesAPI.mediaMessage.number")}
                  name="number"
                  autoFocus
                  variant="outlined"
                  margin="dense"
                  fullWidth
                  className={classes.textField}
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <input type="file" name="medias" id="medias" required onChange={(e) => setFile(e.target.files)} />
              </Grid>
              <Grid item xs={12} className={classes.textRight}>
                <Button
                  type="submit"
                  color="primary"
                  variant="contained"
                  className={classes.btnWrapper}
                >
                  {isSubmitting ? (
                    <CircularProgress
                      size={24}
                      className={classes.buttonProgress}
                    />
                  ) : 'Enviar'}
                </Button>
              </Grid>
            </Grid>
          </Form>
        )}
      </Formik>
    )
  }

  return (
    <Paper
      className={classes.mainPaper}
      variant="outlined"
    >
      <Typography variant="h5">
        Documentação para envio de mensagens
      </Typography>
      <Typography variant="h6" color="primary" className={classes.elementMargin}>
        Métodos de Envio
      </Typography>
      <Typography component="div">
        <ol>
          <li>Mensagens de Texto</li>
          <li>Mensagens de Media</li>
        </ol>
      </Typography>
      <Typography variant="h6" color="primary" className={classes.elementMargin}>
        Tokens de Integração da Empresa
      </Typography>
      <Typography component="div" className={classes.elementMargin}>
        Estes tokens são utilizados para as novas APIs Globais (como a Iniciar Conversa). <br />
        <Button variant="contained" color="primary" onClick={handleGenerateTokens} style={{ marginTop: 10, marginBottom: 10 }}>
          Gerar / Atualizar Tokens
        </Button>
        <br />
        <b>x-access-token:</b> {companyAccess.apiAccessToken || "Nenhum token gerado"}<br />
        <b>x-secret-token:</b> {companyAccess.apiSecretToken || "Nenhum token gerado"}
      </Typography>

      <Typography variant="h6" color="primary" className={classes.elementMargin}>
        Instruções (Envio de Mensagens Simples)
      </Typography>
      <Typography className={classes.elementMargin} component="div">
        <b>Observações importantes</b><br />
        <ul>
          <li>Antes de enviar mensagens, é necessário o cadastro do token vinculado à conexão que enviará as mensagens. <br />Para realizar o cadastro acesse o menu "Conexões", clique no botão editar da conexão e insira o token no devido campo.</li>
          <li>
            O campo número aceita dois tipos de informação:
            <ul>
              <li><b>Número de Whatsapp:</b> Qualquer número de whatsapp completo iniciando pelo código do país (BR=55)</li>
              <li><b>Whatsapp JID:</b> Qualquer identificador do Whatsapp, para grupos ele é um número extenso seguido de @g.us</li>
            </ul>
          </li>
        </ul>
      </Typography>
      <Typography variant="h6" color="primary" className={classes.elementMargin}>
        1. Mensagens de Texto
      </Typography>
      <Grid container>
        <Grid item xs={12} sm={6}>
          <Typography className={classes.elementMargin} component="div">
            <p>Seguem abaixo a lista de informações necessárias para envio das mensagens de texto:</p>
            <b>Endpoint: </b> {getEndpoint()} <br />
            <b>Método: </b> POST <br />
            <b>Headers: </b> Authorization ("Bearer " + token cadastrado) e Content-Type (application/json) <br />
            <b>Body: </b> {"{ \"number\": \"558599999999\", \"body\": \"Sua mensagem\", \"saveOnTicket\": true, \"linkPreview\": true }"}
          </Typography>
        </Grid>
        <Grid item xs={12} sm={6}>
          <Typography className={classes.elementMargin}>
            <b>Teste de Envio</b>
          </Typography>
          {renderFormMessageText()}
        </Grid>
      </Grid>
      <Typography variant="h6" color="primary" className={classes.elementMargin}>
        2. Mensagens de Media
      </Typography>
      <Grid container>
        <Grid item xs={12} sm={6}>
          <Typography className={classes.elementMargin} component="div">
            <p>Seguem abaixo a lista de informações necessárias para envio das mensagens de texto:</p>
            <b>Endpoint: </b> {getEndpoint()} <br />
            <b>Método: </b> POST <br />
            <b>Headers: </b> Authorization ("Bearer " + token cadastrado) e Content-Type (multipart/form-data) <br />
            <b>FormData: </b> <br />
            <ul>
              <li>
                <b>number: </b> 558599999999
              </li>
              <li>
                <b>medias: </b> arquivo
              </li>
              <li>
                <b>saveOnTicket: </b> true
              </li>
            </ul>
          </Typography>
        </Grid>
        <Grid item xs={12} sm={6}>
          <Typography className={classes.elementMargin}>
            <b>Teste de Envio</b>
          </Typography>
          {renderFormMessageMedia()}
        </Grid>
      </Grid>
      <Typography variant="h6" color="primary" className={classes.elementMargin}>
        3. Iniciar Conversa (Nova API Global)
      </Typography>
      <Grid container>
        <Grid item xs={12}>
          <Typography className={classes.elementMargin} component="div">
            <p>Utilize esta API para abrir um ticket diretamente por integração, passando dados do contato e fila ou usuário. Esta API irá rotear automaticamente a requisição pelo canal especificado através do whatsappId.</p>
            <b>Endpoint: </b> {getStartConversationEndpoint()} <br />
            <b>Método: </b> POST <br />
            <b>Headers: </b> <br />
            <ul>
              <li>x-access-token (Obrigatório)</li>
              <li>x-secret-token (Obrigatório)</li>
              <li>Content-Type (application/json)</li>
            </ul>
            <b>Body: </b>
            <pre>
              {`{
  "number": "558599999999", 
  "name": "Nome do Contato", 
  "whatsappId": 1, 
  "queueId": 2, 
  "userId": 5, 
  "message": "Mensagem inicial" 
}`}
            </pre>
          </Typography>
        </Grid>
      </Grid>
    </Paper>
  );
};

export default MessagesAPI;